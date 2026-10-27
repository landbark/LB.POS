-- LANDBARK POS — Migration: โปรโมชั่นแยกหน้าร้าน / งานออกบูธ
--   1) channel_scope — โปรนี้ใช้ได้ที่ไหน (ทุกที่ / หน้าร้านเท่านั้น / งานออกบูธเท่านั้น)
--   2) end_date เว้นว่างได้ = ไม่มีวันหมด — โปรบูธที่ใช้ซ้ำทุกรอบไม่ต้องมาต่ออายุทุกเดือน
-- รันใน Supabase SQL Editor ก่อน deploy เสมอ (รันซ้ำได้ ไม่พังของเดิม)

-- ───────────────────────────────────────────────────────────────
-- 1) ใช้ที่ไหน — ของเดิมทั้งหมดเป็น 'all' เหมือนพฤติกรรมก่อนมีคอลัมน์นี้
-- ───────────────────────────────────────────────────────────────
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS channel_scope TEXT NOT NULL DEFAULT 'all';

COMMENT ON COLUMN promotions.channel_scope IS
  'all = ใช้ทุกที่, store = หน้าร้านเท่านั้น, booth = เฉพาะตอนเปิดโหมดบูธในหน้าขาย';

-- CHECK อาจถูกสร้างไว้แล้วจากการรันรอบก่อน — ลบตามคอลัมน์ที่มันอ้างถึงแล้วใส่ใหม่
CREATE OR REPLACE FUNCTION pg_temp.drop_promo_checks(col TEXT) RETURNS void AS $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'promotions'::regclass AND con.contype = 'c' AND att.attname = col
  LOOP
    EXECUTE format('ALTER TABLE promotions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$ LANGUAGE plpgsql;

SELECT pg_temp.drop_promo_checks('channel_scope');
ALTER TABLE promotions ADD CONSTRAINT promotions_channel_scope_check
  CHECK (channel_scope IN ('all', 'store', 'booth'));

-- ───────────────────────────────────────────────────────────────
-- 2) วันสิ้นสุดเว้นว่างได้
--    โปรออกบูธเด้งเฉพาะตอนเปิดโหมดบูธ ซึ่งกดได้แค่เวลามีรอบเปิดอยู่ —
--    ปล่อยไม่มีวันหมดได้ ไม่หลุดไปโผล่หน้าร้าน
-- ───────────────────────────────────────────────────────────────
ALTER TABLE promotions ALTER COLUMN end_date DROP NOT NULL;

COMMENT ON COLUMN promotions.end_date IS 'NULL = ไม่มีวันหมด (ใช้ไปเรื่อยๆ จนกดปิดใช้งาน)';
