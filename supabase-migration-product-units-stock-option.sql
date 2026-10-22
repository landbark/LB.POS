-- ─────────────────────────────────────────────────────────────────────────────
-- ยุบหน่วย: เลือกได้ว่าจะย้ายสต็อคของตัวแพ็กมารวมไหม
--
-- สต็อคที่ย้ายระบบเข้ามานับของกองเดียวกันไว้ทั้งสองแถว (117 คู่มียอดค้างทั้งฝั่งแพ็ก
-- และฝั่งหน่วยย่อย) เอามาคูณ factor แล้วบวกเข้าไปอีกยอดจะบวมกว่าของจริงหลายเท่า
-- ค่าตั้งต้นจึงเป็น "ไม่ย้าย" — ตัดยอดฝั่งแพ็กทิ้ง ใช้ยอดของหน่วยย่อยที่มีอยู่
-- (เช็กแล้วไม่มีคู่ไหนเลยที่สต็อคอยู่ฝั่งแพ็กอย่างเดียว ปิดการย้ายจึงไม่ทำให้ของหาย)
--
-- ต้องรันต่อจาก supabase-migration-product-units.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- เพิ่มพารามิเตอร์ = เปลี่ยน signature ถ้าใช้ CREATE OR REPLACE เฉยๆ จะได้ฟังก์ชัน
-- สองตัวซ้อนกัน แล้ว PostgREST จะไม่รู้ว่าจะเรียกตัวไหน — ต้อง DROP ตัวเก่าทิ้งก่อน
DROP FUNCTION IF EXISTS merge_pack_product(UUID, UUID, TEXT, INT, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, UUID);

CREATE OR REPLACE FUNCTION merge_pack_product(
  p_pack_product_id UUID,
  p_base_product_id UUID,
  p_unit_name TEXT,
  p_factor INT,
  p_price NUMERIC DEFAULT NULL,
  p_cost NUMERIC DEFAULT NULL,
  p_sellable_pos BOOLEAN DEFAULT true,
  p_purchasable BOOLEAN DEFAULT true,
  p_created_by UUID DEFAULT NULL,
  -- true = ย้ายสต็อคของตัวแพ็กมารวม (× factor), false = ตัดทิ้ง ใช้ยอดของหน่วยย่อย
  p_move_stock BOOLEAN DEFAULT false
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

  FOR v_lot IN
    SELECT * FROM product_lots WHERE product_id = p_pack_product_id AND quantity <> 0 FOR UPDATE
  LOOP
    -- ออกจากกองแพ็กเสมอ ไม่ว่าจะย้ายหรือตัดทิ้ง (stock_movements.quantity ต้องเป็นบวก)
    INSERT INTO stock_movements (product_id, product_lot_id, type, quantity, reason, created_by)
    VALUES (
      p_pack_product_id, v_lot.id,
      CASE WHEN v_lot.quantity > 0 THEN 'adjust_out' ELSE 'adjust_in' END,
      ABS(v_lot.quantity),
      CASE
        WHEN p_move_stock THEN format('ยุบหน่วย: ย้ายไปเป็น %s ของ %s', p_unit_name, COALESCE(v_base.sku, v_base.name))
        ELSE format('ยุบหน่วย: ตัดยอดทิ้ง ใช้สต็อคของ %s แทน', COALESCE(v_base.sku, v_base.name))
      END,
      p_created_by
    );

    IF p_move_stock THEN
      INSERT INTO product_lots (
        product_id, lot_number, supplier_lot_number, expiry_date, quantity, initial_quantity
      ) VALUES (
        p_base_product_id, v_lot.lot_number, v_lot.supplier_lot_number, v_lot.expiry_date,
        v_lot.quantity * p_factor, ABS(v_lot.quantity) * p_factor
      ) RETURNING id INTO v_new_lot_id;

      INSERT INTO stock_movements (product_id, product_lot_id, type, quantity, reason, created_by)
      VALUES (
        p_base_product_id, v_new_lot_id,
        CASE WHEN v_lot.quantity > 0 THEN 'adjust_in' ELSE 'adjust_out' END,
        ABS(v_lot.quantity) * p_factor,
        format('ยุบหน่วย: รับจาก %s (%s × %s)', COALESCE(v_pack.sku, v_pack.name), v_lot.quantity, p_factor),
        p_created_by
      );
    END IF;

    UPDATE product_lots SET quantity = 0 WHERE id = v_lot.id;
  END LOOP;

  RETURN v_unit_id;
END;
$$;
