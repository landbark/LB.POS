-- LANDBARK POS — Migration: PromptPay ID สำหรับสร้าง QR รับเงินที่จอลูกค้า
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS promptpay_id TEXT;
