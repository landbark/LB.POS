-- LANDBARK POS — Migration: อัปโหลด QR รับเงิน static (เช่น QR ของ K SHOP) ไว้โชว์ที่จอสอง
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS payment_qr_url TEXT;
