-- ธง "ขายบน Shopee" — ติดไว้ดูเฉยๆ ว่าสินค้าตัวไหนลงร้าน Shopee ไว้แล้ว
-- คนละเรื่องกับ product_marketplace_links ที่ไว้ sync ผ่าน Shopee API (ยัง WIP)
-- ตัวนี้ร้านติ๊กเอง ใช้คัดรายการตอนออกไฟล์ไปอัปเดตสต็อก/ราคาฝั่ง Shopee
ALTER TABLE products ADD COLUMN IF NOT EXISTS on_shopee BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_products_on_shopee ON products(on_shopee) WHERE on_shopee;
