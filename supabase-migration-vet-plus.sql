-- role 'vet_plus' = สัตวแพทย์พิเศษ (2026-10-27)
-- สิทธิ์เหมือนสัตวแพทย์ทั่วไป + เข้าหน้ารายงาน / เอกสาร / สรุปรายวันได้
-- รันใน Supabase SQL Editor

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'cashier', 'vet', 'vet_plus'));

ALTER TABLE staff_emails DROP CONSTRAINT IF EXISTS staff_emails_role_check;
ALTER TABLE staff_emails ADD CONSTRAINT staff_emails_role_check
  CHECK (role IN ('admin', 'cashier', 'vet', 'vet_plus'));

-- is_vet() ต้องนับ vet_plus เป็นหมอด้วย — สิทธิ์ที่เพิ่มให้คือ "ดู" รายงาน/เอกสาร/สรุปรายวัน
-- ไม่ใช่สิทธิ์เขียนสินค้า/สต็อค/บิล จึงต้องโดน RESTRICTIVE policy "vet readonly *" เหมือนหมอทั่วไป
CREATE OR REPLACE FUNCTION public.is_vet()
RETURNS boolean
SECURITY DEFINER SET search_path = public
LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('vet', 'vet_plus'));
$$;
