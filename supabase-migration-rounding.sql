-- LANDBARK POS — Migration: ปัดเศษสตางค์ท้ายบิล
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- none = ไม่ปัด (เดิม) / normal = ปัดตามหลักปกติ (.50 ขึ้นไปปัดขึ้น) / up = ปัดขึ้นเสมอ / down = ปัดลงเสมอ
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS rounding_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (rounding_mode IN ('none', 'normal', 'up', 'down'));

-- ส่วนต่างจากการปัดเศษของบิลนั้น (+ คือปัดขึ้น, − คือปัดลง)
-- เก็บไว้เพื่อให้ยอดรวมรายการสินค้า + ส่วนลด + ปัดเศษ = ยอดสุทธิเสมอ ตรวจบัญชีย้อนหลังได้
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS rounding NUMERIC(12,2) NOT NULL DEFAULT 0;
