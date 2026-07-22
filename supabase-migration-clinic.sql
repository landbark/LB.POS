-- โมดูลคลินิก ก้อนที่ 1: role สัตวแพทย์ + ทะเบียนสัตว์เลี้ยง + แยกของคลินิกออกจากหน้าขาย (2026-07-22)
-- รันใน Supabase SQL Editor

-- ── role 'vet' ────────────────────────────────────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'cashier', 'vet'));

ALTER TABLE staff_emails DROP CONSTRAINT IF EXISTS staff_emails_role_check;
ALTER TABLE staff_emails ADD CONSTRAINT staff_emails_role_check
  CHECK (role IN ('admin', 'cashier', 'vet'));

-- helper เช็คหมอ — SECURITY DEFINER ข้าม RLS เหมือน is_admin() กัน infinite recursion
CREATE OR REPLACE FUNCTION public.is_vet()
RETURNS boolean
SECURITY DEFINER SET search_path = public
LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'vet');
$$;

-- ── ทะเบียนสัตว์เลี้ยง ────────────────────────────────────────────────────────
-- เจ้าของ = ลูกค้าเดิมในระบบ POS (ไม่แยกฐานลูกค้าคนละชุด)
CREATE TABLE IF NOT EXISTS pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT NOT NULL DEFAULT 'dog' CHECK (species IN ('dog', 'cat', 'bird', 'rabbit', 'rodent', 'reptile', 'other')),
  breed TEXT,
  sex TEXT CHECK (sex IN ('male', 'female')),
  birth_date DATE,
  color TEXT,
  microchip TEXT,
  sterilized BOOLEAN NOT NULL DEFAULT false,
  -- ขึ้นเตือนหัวหน้าฟอร์มตรวจรักษาในก้อนที่ 2
  allergies TEXT,
  chronic_conditions TEXT,
  notes TEXT,
  photo_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pets_customer_id ON pets(customer_id);
CREATE INDEX IF NOT EXISTS idx_pets_name ON pets(name);

ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage pets" ON pets;
CREATE POLICY "auth manage pets" ON pets FOR ALL TO authenticated USING (true);

-- ── แยกของคลินิกออกจากหน้าขาย ────────────────────────────────────────────────
-- ยา/เวชภัณฑ์: ตั้งที่หมวด แล้วสินค้าตั้งทับรายตัวได้ (NULL = ตามหมวด) — แพทเทิร์นเดียวกับ vat_applicable
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS clinic_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS clinic_only BOOLEAN;

-- ค่าตรวจ/ค่าหัตถการ/ค่าผ่าตัด — ขายผ่านไปป์ไลน์ POS เดิมได้ แต่ไม่มีสต็อคให้ตัด
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT false;

-- ── หมอ: อ่านได้ทุกอย่าง เขียนไม่ได้ (ยกเว้นงานคลินิก + ลูกค้า) ───────────────
-- policy เดิมเป็นแบบ permissive (OR กัน) เพิ่มเงื่อนไขทีละอันไม่ได้ผล
-- ใช้ RESTRICTIVE ซ้อนทับแทน (AND กับทุก policy) และแยกตามคำสั่งเพื่อไม่ให้กระทบ SELECT
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products', 'product_lots', 'categories', 'units', 'suppliers',
    'purchases', 'purchase_items', 'transactions', 'transaction_items', 'stock_movements'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "vet readonly insert" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "vet readonly update" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "vet readonly delete" ON %I', t);

    EXECUTE format(
      'CREATE POLICY "vet readonly insert" ON %I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_vet())', t);
    EXECUTE format(
      'CREATE POLICY "vet readonly update" ON %I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_vet())', t);
    EXECUTE format(
      'CREATE POLICY "vet readonly delete" ON %I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_vet())', t);
  END LOOP;
END $$;
