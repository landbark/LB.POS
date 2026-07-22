-- แยกสินค้าว่ามี VAT / ไม่มี VAT (2026-07-22)
-- ตอนนี้ร้านยังไม่ได้จดทะเบียน VAT — คอลัมน์พวกนี้ "เก็บข้อมูลไว้ก่อน" เฉยๆ
-- ยังไม่มีการบวก VAT เข้าราคาขายหรือพิมพ์ VAT ลงใบเสร็จ จนกว่าจะเปิด store_settings.vat_registered

-- ค่าตั้งต้นของหมวดหมู่
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS vat_applicable BOOLEAN NOT NULL DEFAULT false;

-- รายสินค้า: NULL = ใช้ตามหมวดหมู่, true/false = ตั้งเองแยกจากหมวด
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vat_applicable BOOLEAN;

-- บันทึกสถานะ ณ ตอนขาย — ต่อให้ทีหลังย้ายหมวด/แก้สินค้า ยอดเก่าก็ยังถูก
ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS vat_applicable BOOLEAN NOT NULL DEFAULT false;

-- สวิตช์ระดับร้าน: เปิดเมื่อจดทะเบียน VAT แล้วเท่านั้น
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 7;
