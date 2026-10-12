-- LANDBARK POS — Migration: บันทึกเงินเข้า-ออกลิ้นชักระหว่างกะ
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- เจ้าของมาหยิบเงินออกกลางวัน / เอาเงินทอนมาเติม / จ่ายค่าส่งของด้วยเงินเก๊ะ
-- เดิมไม่มีที่บันทึก พอปิดกะเลยขึ้นว่าเงินขาด/เกินทั้งที่ไม่มีอะไรหาย
CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  -- in = เติมเงินเข้าเก๊ะ, out = หยิบเงินออกจากเก๊ะ
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements(shift_id, created_at);

ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage cash_movements" ON cash_movements;
CREATE POLICY "auth manage cash_movements" ON cash_movements FOR ALL TO authenticated USING (true);

-- ตารางใหม่ต้องมี policy "active staff only" ด้วย (event trigger ใส่ให้เอง แต่เรียกซ้ำกันพลาด)
SELECT public.apply_active_staff_policy();
