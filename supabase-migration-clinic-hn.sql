-- เลข HN (hospital number) ของคลินิก — รูปแบบเดียวกับระบบเดิมที่ร้านใช้มาตั้งแต่ปี 2566
--
--   customers.hn = "YY####"      YY = ปี พ.ศ. 2 หลัก, #### = ลำดับเจ้าของในปีนั้น (รีเซ็ตทุกปี)
--   pets.hn      = "YY####-N"    N = ลำดับสัตว์ของเจ้าของคนนั้น (ไม่เติม 0 นำหน้า)
--
-- ตัวอย่างจากข้อมูลเดิม: 660005-1 ... 660005-6, 670142-1, 690032-1
--
-- HN ออกจาก DB ด้วย trigger ไม่ใช่ฝั่งแอป เพราะมีหลายทางที่สร้างลูกค้า/สัตว์
-- (หน้าขาย POS, หน้าคลินิก, admin, สมัครสมาชิกผ่าน LINE) — ทำที่ DB ที่เดียวจบ
-- กัน race ด้วย advisory lock แบบเดียวกับ next_transaction_number()

-- รันไฟล์นี้ก่อน → backfill เลขเดิมจากระบบเก่า → แล้วรัน supabase-migration-clinic-hn-activate.sql
-- (trigger ออกเลขอัตโนมัติอยู่ในไฟล์ activate เพราะต้องรอให้เลขเดิมเข้าที่ก่อน)

ALTER TABLE customers ADD COLUMN IF NOT EXISTS hn TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS hn TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_hn ON customers(hn) WHERE hn IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pets_hn ON pets(hn) WHERE hn IS NOT NULL;

-- ปี พ.ศ. 2 หลักตามเวลาไทย
CREATE OR REPLACE FUNCTION public.hn_year_prefix()
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE sql STABLE AS $$
  SELECT to_char((EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int + 543) % 100, 'FM00');
$$;

-- HN ฐานของเจ้าของคนถัดไป — ลำดับรีเซ็ตทุกปี พ.ศ.
CREATE OR REPLACE FUNCTION public.next_customer_hn()
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  yy text := hn_year_prefix();
  seq int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('customer_hn'));
  SELECT COALESCE(MAX(SUBSTRING(hn FROM 3)::int), 0) + 1
  INTO seq
  FROM customers
  WHERE hn ~ ('^' || yy || '\d{4}$');
  RETURN yy || LPAD(seq::text, 4, '0');
END;
$$;

-- HN ของสัตว์ตัวถัดไปของเจ้าของคนนั้น — ต่อจากลำดับที่ใช้ไปแล้วใต้ฐานเดียวกัน
-- (เจ้าของที่ระบบเดิมลงทะเบียนซ้ำหลายปีจะมีสัตว์ข้ามฐาน เช่น 660006-1 กับ 660045-1
--  ตัวใหม่นับต่อจากฐานปัจจุบันของเจ้าของ ไม่ไปแตะเลขเดิมที่อยู่ในเวชระเบียนกระดาษ)
CREATE OR REPLACE FUNCTION public.next_pet_hn(p_customer_id uuid)
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  base text;
  seq int;
BEGIN
  SELECT hn INTO base FROM customers WHERE id = p_customer_id;
  IF base IS NULL THEN
    -- เจ้าของยังไม่มี HN (ข้อมูลเก่าที่ตกหล่น) — ออกให้ก่อนแล้วค่อยต่อลำดับสัตว์
    base := next_customer_hn();
    UPDATE customers SET hn = base WHERE id = p_customer_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pet_hn:' || base));
  SELECT COALESCE(MAX(SUBSTRING(hn FROM length(base) + 2)::int), 0) + 1
  INTO seq
  FROM pets
  WHERE hn ~ ('^' || base || '-\d+$');
  RETURN base || '-' || seq::text;
END;
$$;
