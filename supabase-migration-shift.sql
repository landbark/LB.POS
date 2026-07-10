-- LANDBARK POS — Migration: ปิดกะ/นับเงินสด (กะเดียวรวมของร้าน)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  expected_cash NUMERIC(12,2),
  closing_cash_counted NUMERIC(12,2),
  cash_difference NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth manage shifts" ON shifts;
CREATE POLICY "auth manage shifts" ON shifts FOR ALL TO authenticated USING (true);

-- กันเปิดกะซ้อนกัน (เปิดพร้อมกันได้ทีละกะเท่านั้น)
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON shifts ((closed_at IS NULL)) WHERE closed_at IS NULL;
