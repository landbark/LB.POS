-- ================================================================
-- LANDBARK POS — จำกัดจำนวนครั้งเรียก API แบบนับรวมทุก instance
--
-- ปัญหา: ตัวนับเดิมเก็บในหน่วยความจำของ instance ที่รันอยู่
--        Vercel รันหลาย instance พร้อมกันและรีไซเคิลเรื่อย ๆ
--        → ยิงกระจายไปหลาย instance ก็เลี่ยงลิมิตได้ง่าย ๆ
--
-- แก้: นับใน Postgres ที่มีอยู่แล้ว ไม่ต้องสมัครบริการเพิ่ม (Redis/Upstash)
--      ปลายทางที่จำกัดคือหน้าสมาชิก ปริมาณน้อยมาก เพิ่ม query 1 ครั้งรับได้สบาย
--
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
-- ================================================================

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key TEXT PRIMARY KEY,
  hits INT NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_window
  ON rate_limit_counters(window_started_at);

-- เข้าถึงผ่าน service role เท่านั้น (เปิด RLS แต่ไม่มี policy = ใครก็แตะไม่ได้)
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

/**
 * นับหนึ่งครั้งแล้วบอกว่าผ่านหรือไม่
 *
 * INSERT ... ON CONFLICT DO UPDATE เป็น atomic ในตัว จึงนับถูกแม้หลาย
 * instance ยิงเข้ามาพร้อมกัน — ไม่ต้องล็อกเอง
 */
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
RETURNS TABLE(allowed boolean, retry_after_seconds int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec rate_limit_counters%ROWTYPE;
  cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
BEGIN
  -- เก็บกวาดแถวหมดอายุเป็นครั้งคราว ไม่ต้องตั้ง cron แยก
  IF random() < 0.01 THEN
    DELETE FROM rate_limit_counters WHERE window_started_at < now() - interval '1 day';
  END IF;

  INSERT INTO rate_limit_counters AS r (key, hits, window_started_at)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    -- ช่วงเวลาเดิมหมดแล้วให้เริ่มนับใหม่ ไม่งั้นบวกเพิ่ม
    hits = CASE WHEN r.window_started_at < cutoff THEN 1 ELSE r.hits + 1 END,
    window_started_at = CASE WHEN r.window_started_at < cutoff THEN now() ELSE r.window_started_at END
  RETURNING * INTO rec;

  allowed := rec.hits <= p_limit;
  retry_after_seconds := GREATEST(
    0,
    CEIL(EXTRACT(EPOCH FROM (rec.window_started_at + make_interval(secs => p_window_seconds) - now())))
  )::int;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, int, int) FROM PUBLIC;

-- ตารางนี้สร้างหลัง migration RLS จึงต้องใส่ policy เอง
-- (ถ้ารัน supabase-migration-auto-policy.sql แล้ว event trigger จะใส่ให้เองตั้งแต่ตอน CREATE)
DROP POLICY IF EXISTS "active staff only" ON rate_limit_counters;
CREATE POLICY "active staff only" ON rate_limit_counters
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());
