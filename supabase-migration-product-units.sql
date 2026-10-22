-- ─────────────────────────────────────────────────────────────────────────────
-- หน่วยขายหลายขนาดต่อสินค้าตัวเดียว (ซอง / กล่อง / ลัง)
--
-- ก่อนหน้านี้ "1 กล่อง" กับ "1 ลัง" ถูกสร้างเป็นสินค้าแยกตัว (SKU ลงท้าย b / c)
-- สต็อคจึงแยกเป็นหลายกอง ทั้งที่ของจริงคือกองเดียว — รับเข้าเป็นลังแล้วขายเป็นซอง
-- ไม่ตัดกัน, min_stock เตือนผิด, ทุน/กำไรเพี้ยน, รายงานสินค้าตัวเดียวโผล่หลายแถว
--
-- โครงใหม่: สต็อคอยู่ที่หน่วยเล็กสุด (products.unit) กองเดียว
--           product_units = หน่วยที่หยิบมาขาย/สั่งซื้อได้ พร้อมตัวคูณและราคาของตัวเอง
--           หน่วยฐาน (factor 1) ไม่ต้องมีแถวในตารางนี้ — มาจาก products เอง
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- ชื่อหน่วย เช่น 'กล่อง' / 'ลัง' / 'กระสอบ'
  unit_name TEXT NOT NULL,
  -- จำนวนหน่วยฐานต่อ 1 หน่วยนี้ (กล่องละ 12 ซอง = 12)
  factor INT NOT NULL CHECK (factor > 1),
  -- SKU/บาร์โค้ดของแพ็ก — ย้ายมาจากสินค้าตัวที่เคยแยกไว้ ใช้สั่งของกับบริษัทและยิงหน้าขาย
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  -- ราคาขายยกแพ็ก (NULL = factor × ราคาฐาน คือไม่ลดราคา)
  price NUMERIC(10,2) CHECK (price >= 0),
  -- ทุนต่อ 1 แพ็ก (NULL = factor × ทุนฐาน) — ใช้เป็นค่าตั้งต้นตอนสั่งซื้อ
  cost NUMERIC(10,2) CHECK (cost >= 0),
  -- โชว์เป็นตัวเลือกในหน้าขาย (ลังมักปิดไว้ ใช้แค่สั่งของ)
  sellable_pos BOOLEAN NOT NULL DEFAULT true,
  -- โชว์บนเว็บร้านค้าออนไลน์
  sellable_online BOOLEAN NOT NULL DEFAULT false,
  -- เลือกได้ตอนทำใบสั่งซื้อ/รับสินค้าเข้า
  purchasable BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- หน่วยชื่อซ้ำในสินค้าตัวเดียวกันไม่ได้ (กล่อง 2 แบบ = ตั้งชื่อให้ต่างกัน เช่น 'กล่อง 6')
  UNIQUE (product_id, unit_name)
);

CREATE INDEX IF NOT EXISTS idx_product_units_product_id ON product_units(product_id);
CREATE INDEX IF NOT EXISTS idx_product_units_barcode ON product_units(barcode) WHERE barcode IS NOT NULL;

-- สินค้าตัวที่ถูกยุบไปเป็นหน่วยของตัวอื่นแล้ว — เก็บแถวไว้ไม่ลบ เพราะประวัติขาย/ซื้อยังอ้างอยู่
ALTER TABLE products ADD COLUMN IF NOT EXISTS replaced_by_unit_id UUID REFERENCES product_units(id) ON DELETE SET NULL;

-- ─── ขาย: quantity = จำนวนหน่วยที่ขาย (2 กล่อง), base_quantity = จำนวนหน่วยฐาน (24 ซอง) ───
-- base_quantity เป็น generated column จะไม่หลุดจากกันเองได้
-- รายงาน/ยอดขายต่อชิ้น ให้ใช้ base_quantity, ใบเสร็จให้ใช้ quantity + unit_name
ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS product_unit_id UUID REFERENCES product_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_factor INT NOT NULL DEFAULT 1 CHECK (unit_factor > 0),
  -- ชื่อหน่วย ณ ตอนขาย (NULL = หน่วยฐานของสินค้า) — snapshot เพราะหน่วยอาจถูกแก้ทีหลัง
  ADD COLUMN IF NOT EXISTS unit_name TEXT;
ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS base_quantity INT GENERATED ALWAYS AS (quantity * unit_factor) STORED;

-- ─── สั่งซื้อ/รับเข้า: quantity = จำนวนแพ็กที่สั่ง, unit_cost = ทุนต่อแพ็ก ───
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS product_unit_id UUID REFERENCES product_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_factor INT NOT NULL DEFAULT 1 CHECK (unit_factor > 0),
  ADD COLUMN IF NOT EXISTS unit_name TEXT;
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS base_quantity INT GENERATED ALWAYS AS (quantity * unit_factor) STORED,
  ADD COLUMN IF NOT EXISTS received_base_quantity INT GENERATED ALWAYS AS (received_quantity * unit_factor) STORED;

-- ─── RLS (เหมือน products: อ่าน/เขียนได้ทุกคนที่ล็อกอิน) ───
ALTER TABLE product_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read product_units" ON product_units;
CREATE POLICY "auth read product_units" ON product_units FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth insert product_units" ON product_units;
CREATE POLICY "auth insert product_units" ON product_units FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth update product_units" ON product_units;
CREATE POLICY "auth update product_units" ON product_units FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "auth delete product_units" ON product_units;
CREATE POLICY "auth delete product_units" ON product_units FOR DELETE TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- ยุบสินค้าแพ็ก (SKU ...b / ...c) เข้าเป็นหน่วยของสินค้าฐาน — ทำทั้งก้อนในทรานแซกชันเดียว
--
-- 1. สร้างแถวหน่วยใหม่ให้สินค้าฐาน (รับ SKU/บาร์โค้ดของแพ็กมาด้วย)
-- 2. ย้ายสต็อคทุกล็อตของแพ็ก → ล็อตของสินค้าฐาน คูณ factor (คงเลขล็อต/วันหมดอายุไว้)
-- 3. ปิดสินค้าแพ็ก + ถอด SKU/บาร์โค้ดออก (ไม่ลบ เพราะประวัติยังอ้างถึง)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION merge_pack_product(
  p_pack_product_id UUID,
  p_base_product_id UUID,
  p_unit_name TEXT,
  p_factor INT,
  p_price NUMERIC DEFAULT NULL,
  p_cost NUMERIC DEFAULT NULL,
  p_sellable_pos BOOLEAN DEFAULT true,
  p_purchasable BOOLEAN DEFAULT true,
  p_created_by UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_pack products;
  v_base products;
  v_unit_id UUID;
  v_lot RECORD;
  v_new_lot_id UUID;
BEGIN
  IF p_factor IS NULL OR p_factor < 2 THEN
    RAISE EXCEPTION 'ตัวคูณต้องเป็นจำนวนเต็มตั้งแต่ 2 ขึ้นไป (ได้ %)', p_factor;
  END IF;
  IF p_pack_product_id = p_base_product_id THEN
    RAISE EXCEPTION 'สินค้าแพ็กกับสินค้าฐานเป็นตัวเดียวกันไม่ได้';
  END IF;

  SELECT * INTO v_pack FROM products WHERE id = p_pack_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบสินค้าแพ็ก %', p_pack_product_id; END IF;
  IF v_pack.replaced_by_unit_id IS NOT NULL THEN
    RAISE EXCEPTION 'สินค้า % ถูกยุบเป็นหน่วยไปแล้ว', COALESCE(v_pack.sku, v_pack.name);
  END IF;

  SELECT * INTO v_base FROM products WHERE id = p_base_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบสินค้าฐาน %', p_base_product_id; END IF;
  IF v_base.replaced_by_unit_id IS NOT NULL THEN
    RAISE EXCEPTION 'สินค้าฐาน % เป็นตัวที่ถูกยุบไปแล้ว เลือกตัวอื่น', COALESCE(v_base.sku, v_base.name);
  END IF;

  -- ถอด SKU/บาร์โค้ดออกจากสินค้าแพ็กก่อน แล้วค่อยย้ายไปติดที่แถวหน่วย (กันชนกันเองตอนค้นหา)
  UPDATE products SET sku = NULL, barcode = NULL, active = false WHERE id = p_pack_product_id;

  INSERT INTO product_units (
    product_id, unit_name, factor, sku, barcode, price, cost,
    sellable_pos, sellable_online, purchasable, sort_order
  ) VALUES (
    p_base_product_id, p_unit_name, p_factor, v_pack.sku, v_pack.barcode,
    COALESCE(p_price, v_pack.price), COALESCE(p_cost, v_pack.cost),
    p_sellable_pos, false, p_purchasable, p_factor
  ) RETURNING id INTO v_unit_id;

  UPDATE products SET replaced_by_unit_id = v_unit_id WHERE id = p_pack_product_id;

  -- ย้ายสต็อคทีละล็อต
  FOR v_lot IN
    SELECT * FROM product_lots WHERE product_id = p_pack_product_id AND quantity <> 0 FOR UPDATE
  LOOP
    INSERT INTO product_lots (
      product_id, lot_number, supplier_lot_number, expiry_date, quantity, initial_quantity
    ) VALUES (
      p_base_product_id, v_lot.lot_number, v_lot.supplier_lot_number, v_lot.expiry_date,
      v_lot.quantity * p_factor, ABS(v_lot.quantity) * p_factor
    ) RETURNING id INTO v_new_lot_id;

    -- ประวัติ: ออกจากกองแพ็ก เข้ากองฐาน (stock_movements.quantity ต้องเป็นบวกเสมอ)
    INSERT INTO stock_movements (product_id, product_lot_id, type, quantity, reason, created_by)
    VALUES (
      p_pack_product_id, v_lot.id,
      CASE WHEN v_lot.quantity > 0 THEN 'adjust_out' ELSE 'adjust_in' END,
      ABS(v_lot.quantity),
      format('ยุบหน่วย: ย้ายไปเป็น %s ของ %s', p_unit_name, COALESCE(v_base.sku, v_base.name)),
      p_created_by
    );
    INSERT INTO stock_movements (product_id, product_lot_id, type, quantity, reason, created_by)
    VALUES (
      p_base_product_id, v_new_lot_id,
      CASE WHEN v_lot.quantity > 0 THEN 'adjust_in' ELSE 'adjust_out' END,
      ABS(v_lot.quantity) * p_factor,
      format('ยุบหน่วย: รับจาก %s (%s × %s)', COALESCE(v_pack.sku, v_pack.name), v_lot.quantity, p_factor),
      p_created_by
    );

    UPDATE product_lots SET quantity = 0 WHERE id = v_lot.id;
  END LOOP;

  RETURN v_unit_id;
END;
$$;
