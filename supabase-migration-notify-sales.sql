-- LANDBARK POS — Migration: แจ้งเตือนการขาย / ใบสั่งซื้อ / รับของเข้า
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- ตั้งเป็น false ไว้ก่อน — ร้านขายวันละหลายสิบบิล เปิดทันทีโดยไม่ได้ตั้งใจจะรำคาญมาก
-- เปิดเองได้ที่ /admin/notifications
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_sale BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_purchase_order BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_stock_received BOOLEAN NOT NULL DEFAULT false;

-- แยกผู้รับเป็น เจ้าของ / พนักงาน / หมอ — เรื่องเงินส่งเฉพาะเจ้าของ, เรื่องคลินิกส่งหมอด้วย
ALTER TABLE telegram_recipients ADD COLUMN IF NOT EXISTS recipient_role TEXT NOT NULL DEFAULT 'staff'
  CHECK (recipient_role IN ('owner', 'staff', 'vet'));

-- ย้ายค่าจากธง is_owner เดิม (รันซ้ำได้ ไม่ทับคนที่ตั้ง role ไว้แล้ว)
UPDATE telegram_recipients SET recipient_role = 'owner'
WHERE is_owner = true AND recipient_role = 'staff';
