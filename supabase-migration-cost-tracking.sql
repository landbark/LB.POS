-- ─────────────────────────────────────────────────────────────────────────────
-- ทุนล่าสุด + ทุนเฉลี่ย
--
-- ก่อนหน้านี้หน้ารับสินค้าเก็บทุนไว้ในใบสั่งซื้ออย่างเดียว ไม่แตะ products.cost
-- ทุนในหน้าสินค้าเลยค้างอยู่ที่ราคางวดเก่า แล้วใบสั่งซื้อใบถัดไปก็ดึงราคาเก่านั้น
-- มาเติมให้อีก (ลัง = ทุนฐาน × จำนวนต่อลัง) ผิดต่อกันไปเรื่อยๆ
--
-- หลังไมเกรชันนี้:
--   products.cost      = ทุนล่าสุด — หน้ารับสินค้าเขียนทับทุกครั้งที่รับของ
--                        ใบสั่งซื้อใบใหม่ดึงตัวนี้ (ไม่ใช่ทุนเฉลี่ย) ตามที่ต้องการ
--   products.avg_cost  = ทุนเฉลี่ยถ่วงน้ำหนักของสต็อคที่เหลืออยู่จริง ดูอย่างเดียว
--                        ระบบคำนวณให้เองทุกครั้งที่สต็อคขยับ แก้มือไม่ได้
--   product_lots.unit_cost = ทุนต่อหน่วยฐานของล็อตนั้น (ลังหาร factor มาแล้ว)
--
-- เฉลี่ยจาก "ของที่เหลือ" ไม่ใช่ค่าเฉลี่ยสะสมตลอดกาล — ล็อตเก่าขายหมดแล้วก็หลุด
-- ออกจากค่าเฉลี่ยเอง ตัวเลขเลยตรงกับของที่วางอยู่บนชั้นตอนนี้จริงๆ
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(10,2) CHECK (avg_cost >= 0);
ALTER TABLE product_lots ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2) CHECK (unit_cost >= 0);

COMMENT ON COLUMN products.cost IS 'ทุนล่าสุดต่อหน่วยฐาน — หน้ารับสินค้าเขียนทับทุกครั้งที่รับของ';
COMMENT ON COLUMN products.avg_cost IS 'ทุนเฉลี่ยถ่วงน้ำหนักของสต็อคที่เหลือ — ระบบคำนวณให้ ห้ามแก้มือ';
COMMENT ON COLUMN product_lots.unit_cost IS 'ทุนต่อหน่วยฐานของล็อตนี้ (สั่งเป็นลัง = ทุน/ลัง ÷ จำนวนต่อลัง)';

-- ล็อตที่มีอยู่ก่อนฟีเจอร์นี้ไม่มีทุนติดมา ใช้ทุนปัจจุบันของสินค้าเป็นตัวตั้ง
-- (ไม่เป๊ะ แต่ดีกว่าปล่อยว่างแล้วทุนเฉลี่ยขึ้น "—" ทั้งร้าน)
UPDATE product_lots l
SET unit_cost = p.cost
FROM products p
WHERE l.product_id = p.id AND l.unit_cost IS NULL AND p.cost IS NOT NULL;

-- ─── ล็อตที่เพิ่มมือเปล่า (หน้าแก้สต็อค/นับสต็อค) ให้รับทุนล่าสุดไปเลย ───────────
-- ไม่งั้นของที่เพิ่มเองจะถ่วงค่าเฉลี่ยหายไปเฉยๆ
CREATE OR REPLACE FUNCTION product_lot_default_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.unit_cost IS NULL THEN
    SELECT cost INTO NEW.unit_cost FROM products WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_lot_default_cost ON product_lots;
CREATE TRIGGER trg_product_lot_default_cost
  BEFORE INSERT ON product_lots
  FOR EACH ROW EXECUTE FUNCTION product_lot_default_cost();

-- ─── คำนวณทุนเฉลี่ยใหม่จากล็อตที่ยังมีของ ────────────────────────────────────
CREATE OR REPLACE FUNCTION recalc_avg_cost(p_product_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_avg NUMERIC;
BEGIN
  SELECT SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0)
  INTO v_avg
  FROM product_lots
  WHERE product_id = p_product_id AND quantity > 0 AND unit_cost IS NOT NULL;

  -- ของหมด (หรือไม่มีล็อตไหนรู้ทุนเลย) = ไม่มีอะไรให้เฉลี่ย เก็บค่าเดิมไว้ดูต่อ
  -- ดีกว่าล้างเป็นว่าง เพราะของหมดชั่วคราวเป็นเรื่องปกติของร้าน
  IF v_avg IS NULL THEN
    RETURN;
  END IF;

  UPDATE products
  SET avg_cost = ROUND(v_avg, 2)
  WHERE id = p_product_id AND avg_cost IS DISTINCT FROM ROUND(v_avg, 2);
END;
$$;

CREATE OR REPLACE FUNCTION product_lot_avg_cost_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- DELETE ไม่มี NEW ให้อ่าน ต้องแยกเคส ไม่งั้น plpgsql ฟ้อง record not assigned
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_avg_cost(OLD.product_id);
  ELSE
    PERFORM recalc_avg_cost(NEW.product_id);
    IF TG_OP = 'UPDATE' AND NEW.product_id IS DISTINCT FROM OLD.product_id THEN
      PERFORM recalc_avg_cost(OLD.product_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_lot_avg_cost ON product_lots;
CREATE TRIGGER trg_product_lot_avg_cost
  AFTER INSERT OR DELETE OR UPDATE OF quantity, unit_cost, product_id ON product_lots
  FOR EACH ROW EXECUTE FUNCTION product_lot_avg_cost_sync();

-- ─── ตั้งค่าเริ่มต้นให้ของที่มีอยู่ตอนนี้ ──────────────────────────────────────
DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT DISTINCT product_id FROM product_lots WHERE quantity > 0 LOOP
    PERFORM recalc_avg_cost(v_id);
  END LOOP;
END;
$$;
