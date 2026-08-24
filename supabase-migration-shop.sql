-- ================================================================
-- หน้าเว็บสาธารณะ + ร้านค้าออนไลน์ (LANDBARK)
--   1) ประกาศข่าว (announcements)
--   2) ช่องทางติดต่อ + สวิตช์เปิด/ปิดร้านออนไลน์ (store_settings)
--   3) น้ำหนักสินค้า + ธงขายออนไลน์ (products)
--   4) โซนจัดส่ง + ค่าส่งตามช่วงน้ำหนัก (shipping_zones / shipping_rates)
--   5) สมุดที่อยู่ลูกค้า (customer_addresses)
--   6) ออเดอร์ออนไลน์ (orders / order_items) + เลขที่ออเดอร์
-- รันใน Supabase SQL Editor
-- ================================================================

-- ---------------------------------------------------------------
-- 1) ประกาศข่าว
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  -- ปิด published = ร่าง (ไม่ขึ้นหน้าเว็บ)
  published BOOLEAN NOT NULL DEFAULT true,
  -- ปักหมุดขึ้นบนสุดของหน้าแรก
  pinned BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_feed
  ON announcements(published, pinned DESC, published_at DESC);

-- ---------------------------------------------------------------
-- 2) ช่องทางติดต่อ + ตั้งค่าร้านออนไลน์
-- ---------------------------------------------------------------
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS line_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  -- ปิดอยู่ = หน้าเว็บโชว์แค่ข่าว/ช่องทางติดต่อ ยังสั่งซื้อไม่ได้
  ADD COLUMN IF NOT EXISTS shop_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shop_intro TEXT,
  -- ข้อความบอกวิธี/เวลา มารับของที่ร้าน
  ADD COLUMN IF NOT EXISTS pickup_note TEXT,
  -- ยอดซื้อขั้นต่ำที่ส่งฟรี (NULL = ไม่มีส่งฟรี)
  ADD COLUMN IF NOT EXISTS free_shipping_min NUMERIC(10,2);

-- ---------------------------------------------------------------
-- 3) สินค้า: น้ำหนัก (กรัม) + ขายบนเว็บ
-- ---------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weight_grams INT CHECK (weight_grams IS NULL OR weight_grams >= 0),
  ADD COLUMN IF NOT EXISTS online_available BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_description TEXT;

-- ---------------------------------------------------------------
-- 4) โซนจัดส่ง + ค่าส่งตามช่วงน้ำหนัก
--    ค่าส่ง = แถวแรกของโซนนั้นที่ max_weight_grams >= น้ำหนักรวมตะกร้า
--    เกินช่วงสูงสุด = คิดค่าส่งอัตโนมัติไม่ได้ (ให้ลูกค้ามารับที่ร้าน/ติดต่อร้าน)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- รายชื่อจังหวัดในโซนนี้ (ชื่อไทย ตรงกับ dropdown ตอนกรอกที่อยู่)
  provinces TEXT[] NOT NULL DEFAULT '{}',
  -- โซนสำรองสำหรับจังหวัดที่ไม่ได้อยู่ในโซนไหนเลย (ควรมีอันเดียว)
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
  max_weight_grams INT NOT NULL CHECK (max_weight_grams > 0),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (zone_id, max_weight_grams)
);

CREATE INDEX IF NOT EXISTS idx_shipping_rates_zone ON shipping_rates(zone_id, max_weight_grams);

-- โซนตั้งต้น 2 โซน + ค่าส่งตัวอย่าง (แก้ได้ในหน้าตั้งค่า)
INSERT INTO shipping_zones (name, provinces, is_default, sort_order)
SELECT 'กรุงเทพฯ และปริมณฑล',
       ARRAY['กรุงเทพมหานคร','นนทบุรี','ปทุมธานี','สมุทรปราการ','สมุทรสาคร','นครปฐม'],
       false, 1
WHERE NOT EXISTS (SELECT 1 FROM shipping_zones);

INSERT INTO shipping_zones (name, provinces, is_default, sort_order)
SELECT 'ต่างจังหวัด', ARRAY[]::TEXT[], true, 2
WHERE NOT EXISTS (SELECT 1 FROM shipping_zones WHERE is_default);

INSERT INTO shipping_rates (zone_id, max_weight_grams, price)
SELECT z.id, r.w, r.p
FROM shipping_zones z
CROSS JOIN LATERAL (
  VALUES (1000, CASE WHEN z.is_default THEN 60 ELSE 40 END),
         (3000, CASE WHEN z.is_default THEN 90 ELSE 60 END),
         (5000, CASE WHEN z.is_default THEN 120 ELSE 80 END),
         (10000, CASE WHEN z.is_default THEN 160 ELSE 110 END),
         (20000, CASE WHEN z.is_default THEN 230 ELSE 160 END)
) AS r(w, p)
WHERE NOT EXISTS (SELECT 1 FROM shipping_rates WHERE zone_id = z.id);

-- ---------------------------------------------------------------
-- 5) สมุดที่อยู่จัดส่งของลูกค้า
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT,
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_line TEXT NOT NULL,
  subdistrict TEXT,
  district TEXT,
  province TEXT NOT NULL,
  postal_code TEXT,
  note TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);

-- ---------------------------------------------------------------
-- 6) ออเดอร์ออนไลน์
--    pending_payment  = สั่งแล้ว รอลูกค้าโอน/แนบสลิป
--    awaiting_confirm = แนบสลิปแล้ว รอร้านตรวจสอบ
--    confirmed        = ร้านยืนยัน (ตัดสต็อค + ลงยอดขายตอนนี้)
--    shipped          = ส่งของแล้ว (มีเลขพัสดุ) / ready_pickup = พร้อมให้มารับที่ร้าน
--    completed        = ลูกค้าได้รับของแล้ว
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','awaiting_confirm','confirmed','shipped','ready_pickup','completed','cancelled')),
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('delivery','pickup')),

  subtotal NUMERIC(12,2) NOT NULL,
  shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  total_weight_grams INT NOT NULL DEFAULT 0,

  -- snapshot ที่อยู่ตอนสั่ง (ที่อยู่ในสมุดอาจถูกแก้/ลบทีหลัง)
  recipient_name TEXT,
  phone TEXT,
  address_line TEXT,
  subdistrict TEXT,
  district TEXT,
  province TEXT,
  postal_code TEXT,
  shipping_zone_name TEXT,

  customer_note TEXT,
  staff_note TEXT,

  payment_slip_path TEXT,
  paid_reported_at TIMESTAMPTZ,

  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  shipped_at TIMESTAMPTZ,
  tracking_carrier TEXT,
  tracking_number TEXT,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cancel_reason TEXT,

  -- บิลขายที่สร้างตอนยืนยันออเดอร์ (ยอดเข้ารายงาน/ใบเสร็จ/แต้ม)
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  -- snapshot ชื่อ/ราคา/น้ำหนัก ณ เวลาสั่ง
  product_name TEXT NOT NULL,
  unit TEXT,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC(12,2) NOT NULL,
  weight_grams INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- เลขที่ออเดอร์ ONddmmyyyy + ลำดับ 4 หลัก รีเซ็ตรายวัน (เวลาไทย) — prefix ยาว 10 ตัว
CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  prefix text := 'ON' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'DDMMYYYY');
  seq int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(order_number FROM 11)::int), 0) + 1
  INTO seq
  FROM orders
  WHERE order_number LIKE prefix || '%';
  RETURN prefix || LPAD(seq::text, 4, '0');
END;
$$;

-- ---------------------------------------------------------------
-- RLS — ตารางใหม่ทั้งหมดเป็นของพนักงาน (หน้าเว็บลูกค้าอ่าน/เขียนผ่าน API service role เท่านั้น)
-- ---------------------------------------------------------------
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read announcements" ON announcements;
CREATE POLICY "auth read announcements" ON announcements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin manage announcements" ON announcements;
CREATE POLICY "admin manage announcements" ON announcements FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "auth read shipping_zones" ON shipping_zones;
CREATE POLICY "auth read shipping_zones" ON shipping_zones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin manage shipping_zones" ON shipping_zones;
CREATE POLICY "admin manage shipping_zones" ON shipping_zones FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "auth read shipping_rates" ON shipping_rates;
CREATE POLICY "auth read shipping_rates" ON shipping_rates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin manage shipping_rates" ON shipping_rates;
CREATE POLICY "admin manage shipping_rates" ON shipping_rates FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "auth manage customer_addresses" ON customer_addresses;
CREATE POLICY "auth manage customer_addresses" ON customer_addresses FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "auth manage orders" ON orders;
CREATE POLICY "auth manage orders" ON orders FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "auth manage order_items" ON order_items;
CREATE POLICY "auth manage order_items" ON order_items FOR ALL TO authenticated USING (true);

-- สัตวแพทย์: อ่านได้ เขียนไม่ได้ (แพทเทิร์นเดียวกับ products/transactions)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders', 'order_items'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "vet readonly insert" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "vet readonly insert" ON %I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_vet())', t);
    EXECUTE format('DROP POLICY IF EXISTS "vet readonly update" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "vet readonly update" ON %I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_vet())', t);
    EXECUTE format('DROP POLICY IF EXISTS "vet readonly delete" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "vet readonly delete" ON %I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_vet())', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- Storage: สลิปโอนเงินของลูกค้า — bucket ส่วนตัว (ไม่ public)
-- อ่านผ่าน signed URL ที่ออกให้ฝั่ง server เท่านั้น
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('payment-slips', 'payment-slips', false, 5242880)
ON CONFLICT (id) DO NOTHING;
