-- LANDBARK POS — Migration: หน้าตั้งค่า (พนักงาน whitelist + active flag)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- 1) profiles: เพิ่ม email + active (คนที่ไม่อยู่ใน whitelist จะ active = false เข้าระบบไม่ได้)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- backfill email จาก auth.users
UPDATE profiles p SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- 2) staff_emails: whitelist อีเมลพนักงานที่ admin อนุญาต (ล็อกอินด้วย Google หรือรหัสผ่านที่ admin ตั้งให้)
CREATE TABLE IF NOT EXISTS staff_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'cashier')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE staff_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manage staff_emails" ON staff_emails;
CREATE POLICY "admin manage staff_emails" ON staff_emails FOR ALL TO authenticated
  USING (public.is_admin());

-- backfill: พนักงานที่มีอยู่แล้วถือว่าได้รับอนุญาต
INSERT INTO staff_emails (email, name, role)
SELECT u.email, p.name, p.role
FROM profiles p JOIN auth.users u ON u.id = p.id
WHERE u.email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- 3) trigger สร้าง profile ตอน signup: เช็ค whitelist
--    อยู่ใน whitelist → ใช้ role/ชื่อจาก whitelist, active = true
--    ไม่อยู่ → สร้างเป็น cashier แต่ active = false (proxy จะกันเข้าระบบ)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff RECORD;
BEGIN
  SELECT * INTO staff FROM public.staff_emails WHERE lower(email) = lower(NEW.email);

  INSERT INTO public.profiles (id, role, name, email, active)
  VALUES (
    NEW.id,
    COALESCE(staff.role, 'cashier'),
    COALESCE(staff.name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email, 'User'),
    NEW.email,
    staff.id IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
