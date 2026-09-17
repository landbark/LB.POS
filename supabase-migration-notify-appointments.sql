-- LANDBARK POS — Migration: แจ้งเตือนนัดหมาย + แยกข้อความเจ้าของ/พนักงาน
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- เตือนทันทีเมื่อมีการจองนัดใหม่ (จากหน้านัดหมาย หรือจากหน้า OPD)
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_new_appointment BOOLEAN NOT NULL DEFAULT true;

-- ผู้รับที่เป็นเจ้าของ = ได้ข้อความเรื่องเงินด้วย (ปิดกะ / สรุปยอดขายรายวัน)
-- backfill: คนที่อนุมัติไว้อยู่แล้วเคยได้ทุกข้อความ — ยกให้เป็นเจ้าของ จะได้ไม่หายไปเงียบ ๆ
-- เงื่อนไข NOT EXISTS ทำให้รันซ้ำแล้วไม่ไปทับค่าที่แอดมินตั้งเองทีหลัง
UPDATE telegram_recipients SET is_owner = true
WHERE approved = true
  AND NOT EXISTS (SELECT 1 FROM telegram_recipients WHERE is_owner);
