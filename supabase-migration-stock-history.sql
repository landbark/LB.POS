-- LANDBARK POS — Migration: ประวัติการเปลี่ยนแปลงสต็อค (ขาย/รับเข้า/ปรับเพิ่ม/ปรับลด)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_lot_id UUID REFERENCES product_lots(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('sale', 'receive', 'adjust_in', 'adjust_out')),
  quantity INT NOT NULL CHECK (quantity > 0),
  reason TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read stock_movements" ON stock_movements;
CREATE POLICY "auth read stock_movements" ON stock_movements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth insert stock_movements" ON stock_movements;
CREATE POLICY "auth insert stock_movements" ON stock_movements FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id, created_at DESC);
