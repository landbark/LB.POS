-- LANDBARK POS — Migration: แยกช่องทางขาย (หน้าร้าน / Shopee / TikTok / Lazada)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- บิลเก่าทั้งหมดถือเป็นขายหน้าร้าน
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS sales_channel TEXT NOT NULL DEFAULT 'store'
    CHECK (sales_channel IN ('store', 'shopee', 'tiktok', 'lazada')),
  -- เลขที่ออเดอร์ของแพลตฟอร์ม ไว้ตามกลับไปหาออเดอร์ต้นทาง
  ADD COLUMN IF NOT EXISTS external_order_no TEXT;

-- รายงานแยกช่องทางจะกรองเฉพาะบิลออนไลน์ ซึ่งเป็นส่วนน้อยของตาราง
CREATE INDEX IF NOT EXISTS idx_transactions_sales_channel
  ON transactions(sales_channel) WHERE sales_channel <> 'store';
