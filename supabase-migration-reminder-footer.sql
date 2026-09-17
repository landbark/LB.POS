-- LANDBARK POS — Migration: ให้เจ้าของร้านแก้ข้อความติดต่อท้ายข้อความเตือนนัดเองได้
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS customer_reminder_footer TEXT;

-- ตั้งค่าเริ่มต้นให้เฉพาะตอนที่ยังว่าง — รันซ้ำแล้วไม่ทับข้อความที่ร้านแก้ไว้เอง
UPDATE notify_settings
SET customer_reminder_footer =
  E'ถ้าต้องการเลื่อนนัดหรือสอบถามเพิ่มเติม ติดต่อคลินิกได้เลยค่ะ\nLINE: @landbark · โทร. 098-329-5945'
WHERE id = 1 AND customer_reminder_footer IS NULL;
