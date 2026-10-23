-- LANDBARK POS — Migration: เลิกเตือนวัคซีนที่เลยกำหนดนานแล้ว
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- วัคซีนที่เลยวันนัดเกินกี่วันแล้วให้หยุดเตือน (วันนัดเดิมยังเก็บไว้ใน pet_vaccinations เหมือนเดิม)
-- 0 = ไม่เลิกเตือน ตามพฤติกรรมเดิมก่อนมีการตั้งค่านี้
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS vaccine_overdue_grace_days INTEGER NOT NULL DEFAULT 30;
