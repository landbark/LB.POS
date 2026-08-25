-- ================================================================
-- ขอเข้าใช้งานเอง แล้วเจ้าของร้านอนุมัติทีหลัง
--
-- เดิม: เจ้าของต้องใส่อีเมลใน staff_emails ก่อน พนักงานถึงจะเข้าได้
-- ใหม่: พนักงาน/หมอ ล็อกอิน Google ได้เลย → โปรไฟล์ถูกสร้างแบบ active = false
--       (trigger handle_new_user เดิมทำให้อยู่แล้ว) → ขึ้นในหน้าตั้งค่าให้เจ้าของกดอนุมัติ
--
-- คอลัมน์นี้ใช้แยก "รออนุมัติ" ออกจาก "เคยถูกปฏิเสธ / เอาออกจากทีมแล้ว"
-- ไม่งั้นคนที่ถูกนำออกจะเด้งกลับมาอยู่ในคิวรออนุมัติอีก
-- รันใน Supabase SQL Editor
-- ================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- คนที่ปิดใช้งานอยู่ก่อนหน้านี้ (เคยถูกเอาออกจากทีม) ไม่ต้องโผล่เป็นคำขอใหม่
UPDATE profiles
SET rejected_at = NOW()
WHERE active = false AND rejected_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_pending
  ON profiles(active, rejected_at)
  WHERE active = false AND rejected_at IS NULL;
