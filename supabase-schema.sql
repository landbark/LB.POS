-- LANDBARK POS — Supabase Schema
-- Run this in Supabase SQL Editor

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cashier')),
  name TEXT NOT NULL,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff whitelist — อีเมลที่ admin อนุญาตให้เข้าระบบ (Google หรือรหัสผ่านที่ admin ตั้งให้)
CREATE TABLE staff_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'cashier')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup — เช็ค whitelist; ไม่อยู่ใน whitelist → active = false (proxy กันเข้าระบบ)
-- ต้องระบุ public. เต็มๆ + SET search_path เพราะ auth service เรียกด้วย search_path ที่มองไม่เห็น public
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff RECORD;
BEGIN
  SELECT * INTO staff FROM public.staff_emails WHERE lower(email) = lower(NEW.email);

  INSERT INTO public.profiles (id, role, name, email, active)
  VALUES (
    NEW.id,
    COALESCE(staff.role, 'cashier'),
    COALESCE(staff.name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email, 'User'),
    NEW.email,
    staff.id IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- helper เช็ค admin — SECURITY DEFINER ข้าม RLS กัน infinite recursion ใน policy ของ profiles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
SECURITY DEFINER SET search_path = public
LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- เลขที่รายการขาย RC + วันเดือนปีค.ศ. (เวลาไทย) + ลำดับ 4 หลัก รีเซ็ตรายวัน
CREATE OR REPLACE FUNCTION public.next_transaction_number()
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  prefix text := 'RC' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'DDMMYYYY');
  seq int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(transaction_number FROM 11)::int), 0) + 1
  INTO seq
  FROM transactions
  WHERE transaction_number LIKE prefix || '%';
  RETURN prefix || LPAD(seq::text, 4, '0');
END;
$$;

-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Units (หน่วยสินค้า — admin เพิ่มได้จากฟอร์มสินค้า)
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suppliers (บริษัทที่สั่งของ)
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  cost NUMERIC(10,2) CHECK (cost >= 0),
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  min_stock INT NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product lots (expiry tracking, FEFO)
CREATE TABLE product_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_number TEXT,
  supplier_lot_number TEXT,
  expiry_date DATE,
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  initial_quantity INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  points INT NOT NULL DEFAULT 0 CHECK (points >= 0),
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ข้อมูลร้าน (singleton) — ใส่หัวเอกสาร (ใบเสร็จ/ใบสั่งซื้อ)
CREATE TABLE store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'LANDBARK',
  address TEXT,
  phone TEXT,
  tax_id TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO store_settings (name) VALUES ('LANDBARK');

-- Points configuration
CREATE TABLE points_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_amount NUMERIC(10,2) NOT NULL DEFAULT 100,
  earn_points INT NOT NULL DEFAULT 1,
  redeem_points INT NOT NULL DEFAULT 100,
  redeem_value NUMERIC(10,2) NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default points config
INSERT INTO points_config (spend_amount, earn_points, redeem_points, redeem_value)
VALUES (100, 1, 100, 1);

-- Promotions
CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent_discount', 'buy_x_get_y')),
  discount_percent NUMERIC(5,2) CHECK (discount_percent > 0 AND discount_percent <= 100),
  buy_quantity INT CHECK (buy_quantity > 0),
  get_quantity INT CHECK (get_quantity > 0),
  apply_to TEXT NOT NULL CHECK (apply_to IN ('all', 'category', 'product')),
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number TEXT NOT NULL UNIQUE,
  cashier_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'card', 'qr')),
  cash_received NUMERIC(12,2),
  change_given NUMERIC(12,2),
  points_earned INT NOT NULL DEFAULT 0,
  points_used INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchases (ใบสั่งซื้อ → รับสินค้า 2 ขั้นตอน)
-- pending = สร้างใบสั่งซื้อแล้ว ยังไม่รู้ล็อต/วันหมดอายุ/ยังไม่เพิ่มสต็อค
-- received = พนักงานกดรับสินค้าแล้ว (ใส่ล็อต/วันหมดอายุ ตอนนี้ + เพิ่มสต็อคจริง)
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number TEXT NOT NULL UNIQUE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received')),
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  received_quantity INT,
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  lot_number TEXT,
  supplier_lot_number TEXT,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ประวัติการเปลี่ยนแปลงสต็อค (ขาย/รับเข้าจากใบสั่งซื้อ/ปรับเพิ่ม/ปรับลดเอง)
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_lot_id UUID REFERENCES product_lots(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('sale', 'receive', 'adjust_in', 'adjust_out')),
  quantity INT NOT NULL CHECK (quantity > 0),
  reason TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transaction items
CREATE TABLE transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_lot_id UUID REFERENCES product_lots(id) ON DELETE SET NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read everything they need
CREATE POLICY "auth read profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read categories" ON categories FOR SELECT TO authenticated USING (true);
-- cashier ใช้งานสินค้า/สต็อค/นำเข้า/ซัพพลายเออร์ได้เต็ม (จำกัดเฉพาะเมนู admin ใน proxy.ts)
CREATE POLICY "auth manage units" ON units FOR ALL TO authenticated USING (true);
CREATE POLICY "auth manage suppliers" ON suppliers FOR ALL TO authenticated USING (true);
CREATE POLICY "auth manage purchases" ON purchases FOR ALL TO authenticated USING (true);
CREATE POLICY "auth manage purchase_items" ON purchase_items FOR ALL TO authenticated USING (true);
CREATE POLICY "auth read products" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read product_lots" ON product_lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read customers" ON customers FOR ALL TO authenticated USING (true);
CREATE POLICY "auth read store_settings" ON store_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read points_config" ON points_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read promotions" ON promotions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage transactions" ON transactions FOR ALL TO authenticated USING (true);
CREATE POLICY "auth manage transaction_items" ON transaction_items FOR ALL TO authenticated USING (true);
CREATE POLICY "auth read stock_movements" ON stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert stock_movements" ON stock_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update product_lots" ON product_lots FOR UPDATE TO authenticated USING (true);

CREATE POLICY "auth manage categories" ON categories FOR ALL TO authenticated USING (true);
CREATE POLICY "auth insert products" ON products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update products" ON products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth insert lots" ON product_lots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth delete lots" ON product_lots FOR DELETE TO authenticated USING (true);

-- Admin-only writes (เรื่องเงิน/สิทธิ์)
CREATE POLICY "admin manage promotions" ON promotions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin manage points_config" ON points_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin manage store_settings" ON store_settings FOR ALL TO authenticated
  USING (public.is_admin());

-- ห้ามใช้ subquery ที่ query profiles ตรงๆ ใน policy ของ profiles (จะ infinite recursion) — ใช้ is_admin() แทน
CREATE POLICY "admin manage profiles" ON profiles FOR ALL TO authenticated
  USING (public.is_admin());

ALTER TABLE staff_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage staff_emails" ON staff_emails FOR ALL TO authenticated
  USING (public.is_admin());

-- Indexes
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_product_lots_product_id ON product_lots(product_id);
CREATE INDEX idx_product_lots_expiry ON product_lots(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id, created_at DESC);

-- Sample categories
INSERT INTO categories (name) VALUES
  ('อาหารสัตว์'),
  ('ขนมสัตว์'),
  ('ของเล่น'),
  ('อุปกรณ์'),
  ('ยา / วิตามิน'),
  ('กรูมมิ่ง');

-- Sample units
INSERT INTO units (name) VALUES
  ('ชิ้น'),('ถุง'),('กระป๋อง'),('กล่อง'),('แพ็ค'),('ขวด'),('ซอง'),('กิโลกรัม');
