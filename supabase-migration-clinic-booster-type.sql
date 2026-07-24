-- โมดูลคลินิก: ประเภทนัดกระตุ้นวัคซีนเป็น preset (2026-07-24)
-- 4w = ห่าง 4 สัปดาห์ (28 วัน), annual = วันเดิมของปีถัดไป, custom = กำหนดวันเอง (ใช้ booster_interval_days)
-- NULL = ไม่ตั้งวันนัด
ALTER TABLE products ADD COLUMN IF NOT EXISTS booster_type TEXT CHECK (booster_type IN ('4w', 'annual', 'custom'));

-- ของเดิมที่เคยตั้งเป็นจำนวนวัน ถือเป็น custom
UPDATE products SET booster_type = 'custom' WHERE booster_interval_days IS NOT NULL AND booster_type IS NULL;
