-- LANDBARK POS — Migration: ที่อยู่ซัพพลายเออร์ (ใช้ขึ้นหัวใบสั่งซื้อ)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
