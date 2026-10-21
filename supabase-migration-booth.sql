-- LANDBARK POS — Migration: งานออกบูธ (ราคาบูธ + รอบออกบูธ + ใบเบิก/ใบคืน)
-- รันใน Supabase SQL Editor ก่อน deploy เสมอ (รันซ้ำได้ ไม่พังของเดิม)

-- ───────────────────────────────────────────────────────────────
-- 1) ราคาขายที่บูธ — ชุดเดียวใช้ทุกงาน (NULL = ใช้ราคาปกติ)
-- ───────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS booth_price NUMERIC(10,2) CHECK (booth_price >= 0);

COMMENT ON COLUMN products.booth_price IS 'ราคาขายตอนออกบูธ — NULL = ใช้ price ตามปกติ';

-- ───────────────────────────────────────────────────────────────
-- 2) รอบออกบูธ — หนึ่งแถวต่อหนึ่งครั้งที่ยกของไปขาย
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booth_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_number TEXT NOT NULL UNIQUE,
  name TEXT,
  location TEXT,
  trip_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- เงินทอนที่เตรียมแยกไปต่างหาก (ไม่เกี่ยวกับเก๊ะที่ร้าน แค่จดไว้กระทบยอดในสรุปรอบ)
  float_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_counted NUMERIC(12,2),
  -- ค่าใช้จ่ายของรอบนี้ ไว้คิดกำไรว่าคุ้มไปไหม
  booth_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (booth_fee >= 0),
  travel_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (travel_cost >= 0),
  other_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_cost >= 0),
  other_cost_note TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- เปิดได้ทีละรอบ — โหมดบูธในหน้าขายอ้างรอบที่เปิดอยู่ ถ้ามีสองรอบจะไม่รู้ว่าบิลเข้ารอบไหน
CREATE UNIQUE INDEX IF NOT EXISTS one_open_booth_trip
  ON booth_trips ((status = 'open')) WHERE status = 'open';

ALTER TABLE booth_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage booth_trips" ON booth_trips;
CREATE POLICY "auth manage booth_trips" ON booth_trips FOR ALL TO authenticated USING (true);

-- ───────────────────────────────────────────────────────────────
-- 3) ใบเบิก / ใบคืน — แถวเดียวต่อสินค้า เอาไปเท่าไร คืนเท่าไร
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booth_trip_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES booth_trips(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  taken_quantity INT NOT NULL CHECK (taken_quantity > 0),
  -- NULL = ยังไม่ได้กรอกใบคืน
  returned_quantity INT CHECK (returned_quantity >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (trip_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_booth_trip_items_trip ON booth_trip_items(trip_id);

ALTER TABLE booth_trip_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage booth_trip_items" ON booth_trip_items;
CREATE POLICY "auth manage booth_trip_items" ON booth_trip_items FOR ALL TO authenticated USING (true);

-- ───────────────────────────────────────────────────────────────
-- 4) ผูกบิลเข้ารอบ + เพิ่ม 'booth' เป็นช่องทางขาย
-- ───────────────────────────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS booth_trip_id UUID REFERENCES booth_trips(id) ON DELETE SET NULL;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_sales_channel_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_sales_channel_check
  CHECK (sales_channel IN ('store', 'shopee', 'tiktok', 'lazada', 'booth'));

CREATE INDEX IF NOT EXISTS idx_transactions_booth_trip
  ON transactions(booth_trip_id) WHERE booth_trip_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────
-- 5) เลขที่รอบ BTH + วันเดือนปี (เวลาไทย) + ลำดับ 2 หลัก
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_booth_trip_number()
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  prefix text := 'BTH' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'DDMMYYYY');
  seq int;
BEGIN
  -- prefix ยาว 11 ตัว ลำดับจึงเริ่มที่ตัวที่ 12
  SELECT COALESCE(MAX(SUBSTRING(trip_number FROM 12)::int), 0) + 1
  INTO seq
  FROM booth_trips
  WHERE trip_number LIKE prefix || '%';
  RETURN prefix || LPAD(seq::text, 2, '0');
END;
$$;
