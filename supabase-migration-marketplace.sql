-- LANDBARK POS — Migration: เชื่อมต่อช่องทางขายออนไลน์ (Shopee/TikTok/Lazada)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- ร้านค้าที่เชื่อมต่อแต่ละแพลตฟอร์ม — เก็บ partner key/token ที่นี่ (เป็นความลับ)
-- ไม่เปิด policy ให้ authenticated อ่าน/เขียนตรงๆ เลย ต้องผ่าน API route + service role เท่านั้น
-- กันไม่ให้ partner_key/access_token หลุดไปที่ browser ฝั่ง client
CREATE TABLE IF NOT EXISTS marketplace_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('shopee', 'tiktok', 'lazada')),
  shop_id TEXT,
  shop_name TEXT,
  partner_id TEXT,
  partner_key TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE marketplace_channels ENABLE ROW LEVEL SECURITY;
-- (ตั้งใจไม่สร้าง policy ใดๆ ให้ authenticated — RLS เปิดแต่ไม่มี policy = เข้าไม่ได้เลยนอกจาก service role)

-- จับคู่สินค้าของเรากับสินค้า/ตัวเลือกสินค้าบนแต่ละ marketplace — ไม่ใช่ข้อมูลลับ จัดการได้จากหน้าสินค้าปกติ
CREATE TABLE IF NOT EXISTS product_marketplace_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  external_item_id TEXT NOT NULL,
  external_model_id TEXT,
  external_name TEXT,
  sync_enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_stock INT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (channel_id, external_item_id, external_model_id)
);

ALTER TABLE product_marketplace_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth manage product_marketplace_links" ON product_marketplace_links;
CREATE POLICY "auth manage product_marketplace_links" ON product_marketplace_links FOR ALL TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_product_marketplace_links_product ON product_marketplace_links(product_id);
