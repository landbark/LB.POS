-- LANDBARK POS — Migration: โปรโมชั่นละเอียดขึ้น
--   1) เลือกสินค้า/หมวดได้หลายรายการต่อโปรโมชั่น
--   2) ลดเป็นบาทได้ (ต่อชิ้น หรือ ต่อรายการ) ไม่ใช่แค่ %
--   3) เงื่อนไข "ซื้อครบ" — ครบจำนวนชิ้น หรือ ครบยอดบาท ถึงจะลด
--   4) เพดานส่วนลดต่อรายการ กันลด % บานปลายกับของแพง
-- รันใน Supabase SQL Editor ก่อน deploy เสมอ (รันซ้ำได้ ไม่พังของเดิม)

-- ───────────────────────────────────────────────────────────────
-- 1) คอลัมน์ใหม่ของ promotions
-- ───────────────────────────────────────────────────────────────
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) CHECK (discount_amount > 0),
  ADD COLUMN IF NOT EXISTS amount_mode TEXT NOT NULL DEFAULT 'per_unit',
  ADD COLUMN IF NOT EXISTS min_quantity INT CHECK (min_quantity > 0),
  ADD COLUMN IF NOT EXISTS min_amount NUMERIC(12,2) CHECK (min_amount > 0),
  ADD COLUMN IF NOT EXISTS max_discount NUMERIC(12,2) CHECK (max_discount > 0);

COMMENT ON COLUMN promotions.discount_amount IS 'ลดเป็นบาท — ใช้กับ type = amount_discount';
COMMENT ON COLUMN promotions.amount_mode     IS 'per_unit = ลดบาทนี้ต่อชิ้น, per_line = ลดบาทนี้ครั้งเดียวต่อรายการในบิล';
COMMENT ON COLUMN promotions.min_quantity    IS 'เงื่อนไข: ต้องซื้อครบกี่ชิ้น (นับเป็นหน่วยฐาน) NULL = ไม่มีเงื่อนไข';
COMMENT ON COLUMN promotions.min_amount      IS 'เงื่อนไข: ยอดของรายการนั้นต้องครบกี่บาท NULL = ไม่มีเงื่อนไข';
COMMENT ON COLUMN promotions.max_discount    IS 'เพดานส่วนลดต่อรายการ (บาท) NULL = ไม่จำกัด';

-- CHECK เดิมของ type/apply_to อาจไม่ได้ชื่อ default ถ้าเคยสร้างมือ — ไล่ลบตามคอลัมน์ที่มันอ้างถึง
CREATE OR REPLACE FUNCTION pg_temp.drop_promo_checks(col TEXT) RETURNS void AS $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'promotions'::regclass AND con.contype = 'c' AND att.attname = col
  LOOP
    EXECUTE format('ALTER TABLE promotions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$ LANGUAGE plpgsql;

-- amount_mode รับได้แค่สองค่า
SELECT pg_temp.drop_promo_checks('amount_mode');
ALTER TABLE promotions ADD CONSTRAINT promotions_amount_mode_check
  CHECK (amount_mode IN ('per_unit', 'per_line'));

-- เพิ่มประเภท amount_discount
SELECT pg_temp.drop_promo_checks('type');
ALTER TABLE promotions ADD CONSTRAINT promotions_type_check
  CHECK (type IN ('percent_discount', 'amount_discount', 'buy_x_get_y'));

-- ───────────────────────────────────────────────────────────────
-- 2) ตารางเชื่อม — โปรโมชั่นหนึ่งอันคลุมได้หลายสินค้า/หลายหมวด
--    ลบสินค้าหรือหมวดทิ้ง = หลุดออกจากโปรโมชั่นเอง (CASCADE)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotion_products (
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, product_id)
);

CREATE TABLE IF NOT EXISTS promotion_categories (
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_products_promo   ON promotion_products(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_categories_promo ON promotion_categories(promotion_id);

ALTER TABLE promotion_products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_categories ENABLE ROW LEVEL SECURITY;

-- แคชเชียร์ต้องอ่านได้ (หน้าขายใช้คิดส่วนลด) แต่แก้ได้แค่แอดมิน เหมือนตาราง promotions
DROP POLICY IF EXISTS "auth read promotion_products" ON promotion_products;
CREATE POLICY "auth read promotion_products" ON promotion_products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manage promotion_products" ON promotion_products;
CREATE POLICY "admin manage promotion_products" ON promotion_products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "auth read promotion_categories" ON promotion_categories;
CREATE POLICY "auth read promotion_categories" ON promotion_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manage promotion_categories" ON promotion_categories;
CREATE POLICY "admin manage promotion_categories" ON promotion_categories
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ───────────────────────────────────────────────────────────────
-- 3) ย้ายของเดิมเข้าตารางเชื่อม แล้วเลิกใช้ product_id / category_id เดี่ยว
--    (บล็อกนี้ข้ามเองถ้ารันซ้ำ เพราะคอลัมน์เก่าถูกลบไปแล้ว)
-- ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promotions' AND column_name = 'product_id'
  ) THEN
    INSERT INTO promotion_products (promotion_id, product_id)
      SELECT id, product_id FROM promotions
      WHERE apply_to = 'product' AND product_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO promotion_categories (promotion_id, category_id)
      SELECT id, category_id FROM promotions
      WHERE apply_to = 'category' AND category_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    PERFORM pg_temp.drop_promo_checks('apply_to');
    UPDATE promotions SET apply_to = 'products'   WHERE apply_to = 'product';
    UPDATE promotions SET apply_to = 'categories' WHERE apply_to = 'category';

    ALTER TABLE promotions DROP COLUMN product_id, DROP COLUMN category_id;
  END IF;
END $$;

-- apply_to เป็นพหูพจน์แล้ว
SELECT pg_temp.drop_promo_checks('apply_to');
ALTER TABLE promotions ADD CONSTRAINT promotions_apply_to_check
  CHECK (apply_to IN ('all', 'categories', 'products'));
