-- LANDBARK POS — Migration: ข้อมูลร้าน + แยกใบสั่งซื้อ/รับสินค้า
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- ข้อมูลร้าน (singleton แบบเดียวกับ points_config) — ใช้ใส่หัวเอกสาร (ใบเสร็จ/ใบสั่งซื้อ)
CREATE TABLE IF NOT EXISTS store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'LANDBARK',
  address TEXT,
  phone TEXT,
  tax_id TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO store_settings (name) SELECT 'LANDBARK' WHERE NOT EXISTS (SELECT 1 FROM store_settings);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read store_settings" ON store_settings;
CREATE POLICY "auth read store_settings" ON store_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin manage store_settings" ON store_settings;
CREATE POLICY "admin manage store_settings" ON store_settings FOR ALL TO authenticated
  USING (public.is_admin());

-- แยก "ใบสั่งซื้อ" (ยังไม่รู้ล็อต/วันหมดอายุ) กับ "รับสินค้า" (พนักงานกดรับตอนของมาส่งจริง)
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received'));
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ใบสั่งซื้อเดิมที่เคยสร้าง lot ไปแล้ว (ก่อน migration นี้) ถือว่ารับแล้ว กันไปโผล่ในคิว "รอรับสินค้า"
UPDATE purchases SET status = 'received', received_at = created_at WHERE status = 'pending';

ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS received_quantity INT;
