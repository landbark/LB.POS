-- สะสมแต้มเฉพาะ "ของที่ซื้อ" — ยา ค่ารักษา ค่าบริการ ไม่สะสมแต้ม
--
-- ก่อนหน้านี้กฎอยู่ในโค้ด (products.is_service = ไม่สะสม) ซึ่งคลุมได้แค่ค่าตรวจ/ค่าหัตถการ
-- แต่ยาเป็น "ของ" ที่มีสต็อกจริง ธง is_service คลุมไม่ได้ และยาก็ไม่ได้อยู่หมวดเดียวกันหมด
-- (NEXGARD/BRAVECTO อยู่หมวด Pet Shop ปนกับทรายแมวกับอาหาร) จึงต้องมีธงของตัวเอง
-- ทั้งระดับหมวดและระดับสินค้า แบบเดียวกับ vat_applicable / clinic_only ที่มีอยู่แล้ว
--
-- กฎนี้คุมแค่ "ขาได้แต้ม" — ลูกค้ายังใช้แต้มมาหักค่ารักษา/ค่ายาได้ตามปกติ
-- รันซ้ำได้ ครั้งที่สองจะไม่แตะค่าที่ร้านปรับไว้เอง (ตั้งค่าเริ่มต้นแค่ตอนเพิ่งเพิ่มคอลัมน์)

DO $$
DECLARE already_there BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'earns_points'
  ) INTO already_there;

  IF already_there THEN
    RAISE NOTICE 'earns_points มีอยู่แล้ว — ข้ามการตั้งค่าเริ่มต้น';
    RETURN;
  END IF;

  ALTER TABLE categories ADD COLUMN earns_points BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE products   ADD COLUMN earns_points BOOLEAN;

  -- ของคลินิกทั้งหมด (ยา เวชภัณฑ์ ค่าตรวจ ค่า Lab ค่าผ่าตัด น้ำเกลือ ฝากเลี้ยง)
  -- + ยาใช้ภายนอก (Tropical Medicine) + หมวดค่าบริการ/ค่าส่ง
  UPDATE categories SET earns_points = false
  WHERE clinic_only = true
     OR name IN ('Tropical Medicine', 'ค่าบริการอื่นๆ');

  -- ยากันเห็บหมัด/พยาธิ ที่ขายหน้าร้านได้ แต่ไปอยู่ในหมวดของเล่น/อาหาร
  -- ตั้งธงรายตัว เพราะหมวดเดียวกันมีของที่ยังต้องสะสมแต้มอยู่
  UPDATE products SET earns_points = false
  WHERE name ~* '(NEXGARD|BRAVECTO|SIMPARICA|FRONTLINE|ADVOCATE|ADVANTAGE|BROADLINE|REVOLUTION|CREDELIO|SERESTO|CAPSTAR|DRONTAL|ENDOGARD|MILBEMAX|BAYTICOL|HEARTGARD|INTERCEPTOR|PROHEART)';
END $$;

COMMENT ON COLUMN categories.earns_points IS 'หมวดนี้สะสมแต้มไหม — ใช้เป็นค่าตั้งต้นให้สินค้าในหมวด';
COMMENT ON COLUMN products.earns_points IS 'null = ใช้ตามหมวดหมู่, true/false = ตั้งแยกเฉพาะสินค้าตัวนี้ (ค่าบริการ is_service ไม่สะสมแต้มอยู่แล้ว)';
