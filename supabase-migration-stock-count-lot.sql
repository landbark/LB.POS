-- LANDBARK POS — Migration: นับสต็อกแยก lot + เก็บวันหมดอายุตอนนับ
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
--
-- ของเดิมนับรวมทุก lot ของสินค้าหนึ่งตัว แล้วปรับส่วนต่างแบบ FEFO ซึ่งพอสำหรับ
-- สินค้าเกือบทั้งร้าน (ส่วนใหญ่มี lot เดียว) — migration นี้เพิ่มทางเลือกให้
-- นับแยก lot ได้เมื่อสินค้ามีหลาย lot และกรอกวันหมดอายุจากกล่องจริงได้ตอนนับ

-- lot ที่นับ — null = นับรวมทุก lot (พฤติกรรมเดิม ปรับส่วนต่างแบบ FEFO)
-- CASCADE เพราะแถวที่ชี้ lot ที่ถูกลบไปแล้วไม่มีความหมาย และถ้า SET NULL
-- แถวจะกลายเป็น "นับรวมทุก lot" ไปชนกับแถวที่มีอยู่จน DELETE lot พัง
-- (ประวัติการปรับสต็อกจริงอยู่ที่ stock_movements อยู่แล้ว ไม่หายไปกับแถวนี้)
ALTER TABLE stock_count_items
  ADD COLUMN IF NOT EXISTS product_lot_id UUID REFERENCES product_lots(id) ON DELETE CASCADE;

-- วันหมดอายุที่อ่านจากกล่องตอนนับ — null = ไม่ได้กรอก (ไม่แตะของเดิมใน lot)
ALTER TABLE stock_count_items
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- คีย์กันนับซ้ำ: หนึ่งแถวต่อ (รอบ, สินค้า, lot) โดยนับรวมทุก lot ใช้ zero-uuid
-- ต้องมีคอลัมน์นี้เพราะ UNIQUE ปกติถือว่า NULL ไม่ซ้ำกัน — ถ้าใช้ product_lot_id
-- ตรง ๆ แถว "นับรวมทุก lot" จะซ้ำได้เรื่อย ๆ และ upsert จะไม่เจอ conflict
ALTER TABLE stock_count_items
  ADD COLUMN IF NOT EXISTS lot_key UUID
  GENERATED ALWAYS AS (COALESCE(product_lot_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

-- ของเดิมล็อกไว้หนึ่งแถวต่อสินค้า — นับแยก lot ต้องมีได้หลายแถว
ALTER TABLE stock_count_items DROP CONSTRAINT IF EXISTS stock_count_items_count_id_product_id_key;

ALTER TABLE stock_count_items DROP CONSTRAINT IF EXISTS stock_count_items_round_lot_key;
ALTER TABLE stock_count_items
  ADD CONSTRAINT stock_count_items_round_lot_key UNIQUE (count_id, product_id, lot_key);

CREATE INDEX IF NOT EXISTS idx_stock_count_items_lot ON stock_count_items(product_lot_id);
