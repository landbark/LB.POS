-- LANDBARK POS — Migration: นับสต็อก (stock count / cycle count)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- รอบนับหนึ่งรอบ — เปิดค้างไว้ข้ามวันได้ หลายคนช่วยกันนับรอบเดียวกันได้
CREATE TABLE IF NOT EXISTS stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_number TEXT NOT NULL UNIQUE,
  name TEXT,
  -- ขอบเขตการนับ: null = ทั้งร้าน, ระบุหมวด = นับเฉพาะหมวดนั้น (cycle count)
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  -- counting = กำลังนับ, posted = ยืนยันปรับสต็อกแล้ว, cancelled = ยกเลิกทิ้ง
  status TEXT NOT NULL DEFAULT 'counting' CHECK (status IN ('counting', 'posted', 'cancelled')),
  note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  posted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ
);

-- หนึ่งแถว = สินค้าหนึ่งตัวที่นับแล้วในรอบนั้น (นับซ้ำ = แก้แถวเดิม)
CREATE TABLE IF NOT EXISTS stock_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- ทั้งสองช่องเป็นหน่วยฐานเสมอ (ยิงบาร์โค้ดลัง ระบบคูณ factor ให้ก่อนบันทึก)
  counted_quantity INT NOT NULL DEFAULT 0,
  -- ยอดในระบบ ณ ตอนบันทึกการนับ — ใช้คิดส่วนต่าง ไม่ใช่ยอดตอนกดยืนยัน
  -- (ระหว่างนับร้านยังขายอยู่ ถ้าเทียบกับยอดตอนยืนยันของที่ขายไปจะกลายเป็นของขาด)
  system_quantity INT NOT NULL DEFAULT 0,
  -- ส่วนต่างที่ปรับเข้าสต็อกจริงตอนกดยืนยัน (null = ยังไม่ยืนยัน)
  applied_diff INT,
  note TEXT,
  counted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  counted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (count_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_status ON stock_counts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_count ON stock_count_items(count_id);

ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth manage stock_counts" ON stock_counts;
CREATE POLICY "auth manage stock_counts" ON stock_counts FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "auth manage stock_count_items" ON stock_count_items;
CREATE POLICY "auth manage stock_count_items" ON stock_count_items FOR ALL TO authenticated USING (true);
