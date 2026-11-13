-- LANDBARK POS — Migration: แต้มมีวันหมดอายุ (365 วัน)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
--
-- เดิม customers.points เป็นตัวเลขยอดเดียว ไม่รู้ว่าแต้มแต่ละแต้มได้มาวันไหน
-- จึงบอกไม่ได้ว่าอันไหนหมดอายุ ไฟล์นี้เพิ่ม "สมุดก้อนแต้ม" (point_lots)
-- ทุกครั้งที่ลูกค้าได้แต้ม = หนึ่งก้อน พร้อมวันหมดอายุของก้อนนั้น
-- ส่วน customers.points กลายเป็นแค่ยอดที่คัดลอกไว้โชว์ คิดใหม่จากก้อนทุกครั้งที่ขยับ
--
-- ใช้แต้ม = ตัดก้อนที่ใกล้หมดอายุก่อน (ลูกค้าเสียเปรียบน้อยสุด)

-- ───────────────────────────────────────────────────────────────
-- 1. ตั้งค่าอายุแต้ม
-- ───────────────────────────────────────────────────────────────
ALTER TABLE points_config
  ADD COLUMN IF NOT EXISTS expiry_days INT NOT NULL DEFAULT 365;

-- 0 = ไม่มีวันหมดอายุ (เผื่อเจ้าของเปลี่ยนใจภายหลัง)
ALTER TABLE points_config DROP CONSTRAINT IF EXISTS points_config_expiry_days_check;
ALTER TABLE points_config
  ADD CONSTRAINT points_config_expiry_days_check CHECK (expiry_days >= 0);

-- ───────────────────────────────────────────────────────────────
-- 2. สมุดก้อนแต้ม
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS point_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- บิลที่ทำให้ได้แต้มก้อนนี้ — ใช้ถอนคืนตอนยกเลิกบิล/คืนของ
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  points INT NOT NULL CHECK (points >= 0),
  -- ใช้ไปแล้วกี่แต้มจากก้อนนี้ (เหลือ = points - used)
  used INT NOT NULL DEFAULT 0 CHECK (used >= 0),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT point_lots_used_within_points CHECK (used <= points)
);

-- ก้อนที่ยังมีแต้มเหลือของลูกค้าคนนั้น เรียงตามวันหมดอายุ — ใช้ทุกครั้งที่ตัดแต้ม
CREATE INDEX IF NOT EXISTS idx_point_lots_live
  ON point_lots(customer_id, expires_at) WHERE points > used;
CREATE INDEX IF NOT EXISTS idx_point_lots_tx ON point_lots(transaction_id);

ALTER TABLE point_lots ENABLE ROW LEVEL SECURITY;

-- พนักงานอ่านได้ (หน้าขาย/หลังร้านโชว์วันหมดอายุ) ส่วนการแก้ยอดทำผ่าน apply_points() เท่านั้น
DROP POLICY IF EXISTS "auth read point_lots" ON point_lots;
CREATE POLICY "auth read point_lots" ON point_lots
  FOR SELECT TO authenticated USING (true);

-- ตารางใหม่ต้องมี policy "active staff only" (restrictive) ด้วย — ปกติ event trigger
-- ใส่ให้ตอน CREATE TABLE แต่เรียกซ้ำไว้กันพลาด ดู supabase-migration-auto-policy.sql
DO $$
BEGIN
  IF to_regprocedure('public.apply_active_staff_policy()') IS NOT NULL THEN
    PERFORM 1 FROM public.apply_active_staff_policy();
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────
-- 3. วันหมดอายุของแต้มที่ได้ ณ เวลาหนึ่ง
-- ───────────────────────────────────────────────────────────────
-- ให้ถึง "สิ้นวัน" ของวันที่ 365 ตามเวลาไทย ลูกค้าจึงได้ใช้เต็มวันสุดท้าย
-- ไม่ใช่หมดตอนบ่ายสามเพราะบังเอิญซื้อบ่ายสามเมื่อปีที่แล้ว
CREATE OR REPLACE FUNCTION public.point_expiry_at(p_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN COALESCE((SELECT expiry_days FROM points_config LIMIT 1), 365) <= 0
      THEN 'infinity'::timestamptz
    ELSE (date_trunc('day', p_at AT TIME ZONE 'Asia/Bangkok')
          + make_interval(days => COALESCE((SELECT expiry_days FROM points_config LIMIT 1), 365) + 1)
         ) AT TIME ZONE 'Asia/Bangkok'
  END;
$$;

-- ───────────────────────────────────────────────────────────────
-- 4. ยอดแต้มที่ใช้ได้จริง = ก้อนที่ยังไม่หมดอายุ
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.points_balance(p_customer UUID)
RETURNS INT
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(SUM(points - used), 0)::int
  FROM point_lots
  WHERE customer_id = p_customer AND expires_at > NOW();
$$;

-- ───────────────────────────────────────────────────────────────
-- 5. ทุกการขยับแต้มผ่านฟังก์ชันเดียว
-- ───────────────────────────────────────────────────────────────
-- p_earn    แต้มใหม่จากบิลนี้            → ก้อนใหม่ นับอายุจากวันขาย
-- p_spend   แต้มที่ลูกค้าใช้              → ตัดก้อนใกล้หมดอายุก่อน
-- p_restore คืนแต้มที่เคยใช้ (คืนของ)     → คลาย used ของก้อนเดิม วันหมดอายุเดิมยังอยู่
-- p_revoke  ถอนแต้มที่เคยให้ (ยกเลิกบิล)  → ลบออกจากก้อนของบิลนั้น
--
-- คืนยอดแต้มคงเหลือหลังทำรายการ (ค่าเดียวกับที่เขียนลง customers.points)
CREATE OR REPLACE FUNCTION public.apply_points(
  p_customer UUID,
  p_earn INT DEFAULT 0,
  p_spend INT DEFAULT 0,
  p_restore INT DEFAULT 0,
  p_revoke INT DEFAULT 0,
  p_transaction UUID DEFAULT NULL,
  p_at TIMESTAMPTZ DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ts TIMESTAMPTZ := COALESCE(p_at, NOW());
  rest INT;
  take INT;
  lot RECORD;
  bal INT;
BEGIN
  IF p_customer IS NULL THEN RETURN 0; END IF;

  -- เช็คสิทธิ์ที่ DB ด้วย ไม่ใช่เชื่อหน้าเว็บ (ฟังก์ชันนี้ SECURITY DEFINER ข้าม RLS ได้)
  -- ใครก็ยิง rpc ตรงด้วย JWT ตัวเองได้ ถ้าไม่กันตรงนี้คือแจกแต้มให้ตัวเองได้
  IF NOT public.is_active_staff()
     AND COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'ปรับแต้มได้เฉพาะพนักงานที่ได้รับอนุมัติ';
  END IF;

  -- ล็อกแถวลูกค้าไว้ก่อน — สองเครื่องปิดบิลคนเดียวกันพร้อมกันจะได้ไม่ตัดแต้มก้อนเดียวกันซ้อน
  PERFORM 1 FROM customers WHERE id = p_customer FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- ── ถอนแต้มที่เคยให้ไว้ ──────────────────────────────────────
  rest := GREATEST(COALESCE(p_revoke, 0), 0);
  IF rest > 0 AND p_transaction IS NOT NULL THEN
    FOR lot IN
      SELECT * FROM point_lots
      WHERE customer_id = p_customer AND transaction_id = p_transaction AND points > used
      ORDER BY earned_at FOR UPDATE
    LOOP
      EXIT WHEN rest <= 0;
      take := LEAST(rest, lot.points - lot.used);
      UPDATE point_lots SET points = points - take WHERE id = lot.id;
      rest := rest - take;
    END LOOP;
  END IF;
  -- ถอนจากก้อนของบิลนั้นไม่ครบ (ลูกค้าใช้แต้มไปแล้ว) → ตัดจากก้อนอื่น ใกล้หมดอายุก่อน
  IF rest > 0 THEN
    FOR lot IN
      SELECT * FROM point_lots
      WHERE customer_id = p_customer AND points > used AND expires_at > ts
      ORDER BY expires_at, earned_at FOR UPDATE
    LOOP
      EXIT WHEN rest <= 0;
      take := LEAST(rest, lot.points - lot.used);
      UPDATE point_lots SET points = points - take WHERE id = lot.id;
      rest := rest - take;
    END LOOP;
  END IF;

  -- ── คืนแต้มที่ลูกค้าเคยใช้ ────────────────────────────────────
  rest := GREATEST(COALESCE(p_restore, 0), 0);
  IF rest > 0 THEN
    -- คลายก้อนที่อายุยาวสุดก่อน = ย้อนลำดับที่ตัดไปตอนใช้
    FOR lot IN
      SELECT * FROM point_lots
      WHERE customer_id = p_customer AND used > 0 AND expires_at > ts
      ORDER BY expires_at DESC, earned_at DESC FOR UPDATE
    LOOP
      EXIT WHEN rest <= 0;
      take := LEAST(rest, lot.used);
      UPDATE point_lots SET used = used - take WHERE id = lot.id;
      rest := rest - take;
    END LOOP;
    -- ก้อนเดิมหมดอายุไปแล้ว คืนให้เป็นก้อนใหม่ นับอายุจากวันที่คืนของ
    IF rest > 0 THEN
      INSERT INTO point_lots (customer_id, transaction_id, points, earned_at, expires_at, note)
      VALUES (p_customer, p_transaction, rest, ts, point_expiry_at(ts), 'คืนแต้มที่ใช้ไปแล้ว');
    END IF;
  END IF;

  -- ── ใช้แต้ม ─────────────────────────────────────────────────
  rest := GREATEST(COALESCE(p_spend, 0), 0);
  IF rest > 0 THEN
    FOR lot IN
      SELECT * FROM point_lots
      WHERE customer_id = p_customer AND points > used AND expires_at > ts
      ORDER BY expires_at, earned_at FOR UPDATE
    LOOP
      EXIT WHEN rest <= 0;
      take := LEAST(rest, lot.points - lot.used);
      UPDATE point_lots SET used = used + take WHERE id = lot.id;
      rest := rest - take;
    END LOOP;
    -- แต้มไม่พอ (เช่นเพิ่งหมดอายุคาบิล) ไม่ขวางการขาย บิลบันทึกไปแล้ว
    -- ยอดคงเหลือข้างล่างจะเป็นตัวบอกความจริง ไม่ปล่อยให้ติดลบ
  END IF;

  -- ── แต้มใหม่จากบิลนี้ ────────────────────────────────────────
  -- ทำท้ายสุด ก้อนใหม่จะได้ไม่ถูกใช้ในบิลเดียวกันที่เพิ่งสร้างมัน
  IF COALESCE(p_earn, 0) > 0 THEN
    INSERT INTO point_lots (customer_id, transaction_id, points, earned_at, expires_at)
    VALUES (p_customer, p_transaction, p_earn, ts, point_expiry_at(ts));
  END IF;

  bal := points_balance(p_customer);
  UPDATE customers SET points = bal WHERE id = p_customer;
  RETURN bal;
END $$;

REVOKE ALL ON FUNCTION public.apply_points(UUID, INT, INT, INT, INT, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_points(UUID, INT, INT, INT, INT, UUID, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_points(UUID, INT, INT, INT, INT, UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_points(UUID, INT, INT, INT, INT, UUID, TIMESTAMPTZ) TO service_role;

-- ───────────────────────────────────────────────────────────────
-- 6. กวาดแต้มที่หมดอายุ (cron รายวัน)
-- ───────────────────────────────────────────────────────────────
-- ไม่ได้ลบก้อนทิ้ง แค่คิดยอดใน customers.points ใหม่ — ก้อนที่หมดอายุไม่ถูกนับ
-- เก็บก้อนไว้เพื่อให้ตอบลูกค้าได้ว่าแต้มหายไปเพราะอะไร
-- คืนจำนวนลูกค้าที่ยอดเปลี่ยน
CREATE OR REPLACE FUNCTION public.expire_points()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  WITH bal AS (
    SELECT c.id,
           COALESCE(SUM(l.points - l.used) FILTER (WHERE l.expires_at > NOW()), 0)::int AS pts
    FROM customers c
    JOIN point_lots l ON l.customer_id = c.id
    GROUP BY c.id
  )
  UPDATE customers c SET points = bal.pts
  FROM bal
  WHERE c.id = bal.id AND c.points IS DISTINCT FROM bal.pts;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.expire_points() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_points() FROM anon;
-- cron ยิงด้วย service role (ไม่มี session พนักงาน)
GRANT EXECUTE ON FUNCTION public.expire_points() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_points() TO authenticated;

-- ───────────────────────────────────────────────────────────────
-- 7. ยกยอดแต้มที่มีอยู่แล้วเข้าสมุด
-- ───────────────────────────────────────────────────────────────
-- รันซ้ำได้ และ "ควร" รันซ้ำอีกรอบหลัง deploy โค้ดใหม่ขึ้นเว็บแล้ว
-- เผื่อมีบิลที่ปิดคาบเกี่ยวระหว่างรัน SQL กับ deploy (โค้ดเก่าบวกแต้มโดยไม่ได้ออกก้อน)
DO $$
DECLARE
  c RECORD;
  l RECORD;
  held INT;
  rest INT;
  take INT;
  first_run BOOLEAN := NOT EXISTS (SELECT 1 FROM point_lots LIMIT 1);
BEGIN
  -- ── ก้อนตามบิลจริงที่เคยให้แต้มไว้ แต่ยังไม่มีก้อน ───────────────
  -- วันหมดอายุนับจากวันที่ขายจริง ไม่ใช่วันที่รัน migration
  INSERT INTO point_lots (customer_id, transaction_id, points, earned_at, expires_at, note)
  SELECT t.customer_id, t.id, t.points_earned, t.created_at,
         point_expiry_at(t.created_at), 'ยกยอดจากบิลเดิม'
  FROM transactions t
  WHERE t.customer_id IS NOT NULL
    AND t.points_earned > 0
    AND t.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM point_lots l2 WHERE l2.transaction_id = t.id);

  -- ── ปรับยอดให้ตรงกับที่ลูกค้าถืออยู่จริง (ครั้งแรกครั้งเดียว) ──────
  -- ทำได้เฉพาะตอนยังไม่เคยมีแต้มหมดอายุ ไม่งั้นจะเผลอชุบชีวิตแต้มที่หมดไปแล้ว
  IF NOT first_run THEN
    RAISE NOTICE 'ยกยอดไปแล้วรอบก่อน — เติมเฉพาะก้อนของบิลที่ยังขาด';
  ELSE
    -- ต้องไล่ทั้งคนที่ยังมีแต้มเหลือ และคนที่ใช้หมดไปแล้ว (ก้อนจากบิลเก่าต้องถูกปิดด้วย)
    FOR c IN
      SELECT id, points FROM customers
      WHERE points <> 0 OR id IN (SELECT customer_id FROM point_lots)
    LOOP
      SELECT COALESCE(SUM(points - used), 0) INTO held FROM point_lots WHERE customer_id = c.id;

      IF held > c.points THEN
        -- ให้ไปมากกว่าที่ถืออยู่ = ลูกค้าใช้ไปบ้างแล้ว ทำเครื่องหมายว่าใช้แล้ว
        -- ไล่จากก้อนใกล้หมดอายุก่อน ให้ตรงกับกติกาการตัดแต้มปกติ
        rest := held - c.points;
        FOR l IN
          SELECT * FROM point_lots WHERE customer_id = c.id AND points > used
          ORDER BY expires_at, earned_at
        LOOP
          EXIT WHEN rest <= 0;
          take := LEAST(rest, l.points - l.used);
          UPDATE point_lots SET used = used + take WHERE id = l.id;
          rest := rest - take;
        END LOOP;

      ELSIF held < c.points THEN
        -- แต้มที่มีมากกว่าร่องรอยในบิล (ของเก่าก่อนมีระบบ / ปรับมือ) — ให้อายุเต็มนับจากวันนี้
        INSERT INTO point_lots (customer_id, points, earned_at, expires_at, note)
        VALUES (c.id, c.points - held, NOW(), point_expiry_at(NOW()),
                'ยกยอดแต้มเดิมตอนเริ่มใช้วันหมดอายุ');
      END IF;
    END LOOP;
  END IF;

  PERFORM expire_points();
END $$;
