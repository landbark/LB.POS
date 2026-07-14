-- LANDBARK POS — Migration: นับเงินปิดกะแยกตามแบงค์/เหรียญ + แยกแบงค์พันให้เจ้าของ
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- รายละเอียดการนับเงินตอนปิดกะ เช่น {"1000": 2, "100": 5, "20": 3}
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closing_denominations JSONB;

-- ยอดที่แยกออกให้เจ้าของตอนปิดกะ (ปกติ = แบงค์พันทั้งหมด)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_to_owner NUMERIC(12,2);
