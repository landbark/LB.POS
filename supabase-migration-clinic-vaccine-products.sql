-- โมดูลคลินิก: ผูกวัคซีนกับสินค้า — จ่ายวัคซีนในหน้าตรวจ = ลงประวัติวัคซีนอัตโนมัติ (2026-07-23)
-- รันใน Supabase SQL Editor

-- ติ๊กว่าหมวด/สินค้าเป็นวัคซีน (แพทเทิร์นเดียวกับ clinic_only: NULL = ตามหมวด)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_vaccine BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_vaccine BOOLEAN;
-- ระยะกระตุ้นเข็มถัดไป (วัน) ต่อสินค้าวัคซีน — ใช้คำนวณวันนัดตอนลงประวัติอัตโนมัติ
ALTER TABLE products ADD COLUMN IF NOT EXISTS booster_interval_days INT;

-- ผูกประวัติวัคซีนกลับไปที่สินค้าที่จ่าย (ใช้กันลงซ้ำเวลาลงอัตโนมัติ + อ้างอิง)
ALTER TABLE pet_vaccinations ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
