-- ข้อมูลยาสำหรับพิมพ์ฉลาก
-- ชื่อในสต็อก (products.name) มักมีขนาด/ยี่ห้อ/รหัสผู้ขายติดมาด้วย ซึ่งเจ้าของสัตว์อ่านไม่รู้เรื่อง
-- จึงให้กำหนด "ชื่อที่จะพิมพ์บนฉลาก" + "สรรพคุณ" + "ยี่ห้อ" แยกไว้ (มีช่องภาษาอังกฤษด้วย
-- สำหรับฉลากที่ติ๊กเป็นอังกฤษ — ไม่กรอกก็ fallback ไปใช้ภาษาไทย)
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_name_en TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS indication TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS indication_en TEXT;
-- ยี่ห้อเป็นชื่อเฉพาะ ไม่ต้องแปล ใช้ช่องเดียวทั้งสองภาษา
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
