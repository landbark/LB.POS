-- LANDBARK POS — Migration: นับเงินปิดกะแยกตามแบงค์/เหรียญ + แยกแบงค์พันให้เจ้าของ
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- รายละเอียดการนับเงินตอนปิดกะ เช่น {"1000": 2, "100": 5, "20": 3}
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closing_denominations JSONB;

-- ยอดที่แยกออกให้เจ้าของตอนปิดกะ (วันไหนเจ้าของไม่อยู่ = 0)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_to_owner NUMERIC(12,2);

-- รายละเอียดแบงค์ที่แยกให้เจ้าของ เช่น {"1000": 3, "500": 1}
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS owner_denominations JSONB;
