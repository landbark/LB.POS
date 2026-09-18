-- ================================================================
-- LANDBARK POS — ปิดการสมัครเอง ใช้ whitelist อย่างเดียว
--
-- เดิม: ใครมี Google ก็ล็อกอินได้ ระบบสร้างโปรไฟล์ active = false ไว้รออนุมัติ
--       → มีบัญชีค้างในระบบเต็มไปหมด และได้ JWT ที่ role = authenticated ติดมือไป
--
-- ใหม่: อีเมลต้องอยู่ใน staff_emails ก่อน ถึงจะสร้างบัญชีได้เลย
--       ไม่อยู่ในนั้น = สมัครไม่ผ่านตั้งแต่แรก ไม่มีบัญชีค้าง ไม่มี JWT
--
-- เจ้าของร้านเพิ่ม/ลบอีเมลเองได้ที่ ตั้งค่า → พนักงาน (/admin/settings)
--
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff RECORD;
BEGIN
  SELECT * INTO staff FROM public.staff_emails WHERE lower(email) = lower(NEW.email);

  -- ไม่อยู่ใน whitelist = ไม่ให้สร้างบัญชี
  -- RAISE อยู่นอก block ที่ดัก exception จึงหยุดการสมัครได้จริง
  IF staff.id IS NULL THEN
    RAISE EXCEPTION 'อีเมลนี้ยังไม่ได้รับอนุญาตให้เข้าใช้งานระบบ กรุณาติดต่อเจ้าของร้าน'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, role, name, email, active)
    VALUES (
      NEW.id,
      COALESCE(staff.role, 'cashier'),
      COALESCE(staff.name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email, 'User'),
      NEW.email,
      true
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- สร้างโปรไฟล์ไม่สำเร็จไม่ควรทำให้ล็อกอินพัง (แถวอาจมีอยู่แล้ว)
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- บัญชีที่ค้างอยู่จากยุคสมัครเองได้ และไม่เคยถูกอนุมัติ — ทำเครื่องหมายว่าปฏิเสธ
-- เข้าระบบไม่ได้อยู่แล้วเพราะ active = false + RLS แต่กันไม่ให้ค้างในคิวรออนุมัติ
UPDATE public.profiles
SET rejected_at = NOW()
WHERE active = false AND rejected_at IS NULL;

-- ตรวจผล: ควรเห็นเฉพาะคนที่อยู่ใน whitelist และ active = true
SELECT p.email, p.role, p.active,
       (s.id IS NOT NULL) AS in_whitelist
FROM public.profiles p
LEFT JOIN public.staff_emails s ON lower(s.email) = lower(p.email)
ORDER BY p.active DESC, p.email;
