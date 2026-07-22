-- โมดูลคลินิก ก้อนที่ 2: เวชระเบียน OPD + คิวเก็บเงินที่หน้าขาย (2026-07-22)
-- รันใน Supabase SQL Editor (ต้องรัน supabase-migration-clinic.sql ก่อน)

-- เลขที่เวชระเบียน OPD + วันเดือนปีค.ศ. (เวลาไทย) + ลำดับ 4 หลัก รีเซ็ตรายวัน
-- prefix 'OPD' + 8 หลัก = 11 ตัว ลำดับจึงเริ่มที่ตัวที่ 12
CREATE OR REPLACE FUNCTION public.next_visit_number()
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  prefix text := 'OPD' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'DDMMYYYY');
  seq int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(visit_number FROM 12)::int), 0) + 1
  INTO seq
  FROM visits
  WHERE visit_number LIKE prefix || '%';
  RETURN prefix || LPAD(seq::text, 4, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_number TEXT NOT NULL UNIQUE,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  -- เจ้าของ ณ วันที่มาตรวจ (เก็บแยกจาก pets.customer_id เผื่อเปลี่ยนมือทีหลัง — ใบเสร็จต้องตรงกับคนที่จ่ายจริง)
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  vet_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  visit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- สัญญาณชีพ
  weight NUMERIC(6,2),
  temperature NUMERIC(4,1),
  heart_rate INT,
  resp_rate INT,

  symptoms TEXT,
  diagnosis TEXT,
  treatment TEXT,
  notes TEXT,
  follow_up_date DATE,

  -- open = หมอยังบันทึกอยู่, pending_payment = ส่งไปเก็บเงินแล้วรอแคชเชียร์, paid = เก็บเงินแล้ว
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending_payment', 'paid', 'cancelled')),
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ยา/บริการที่หมอสั่งจ่าย — ยังไม่ตัดสต็อค จะตัดตอนแคชเชียร์เก็บเงินที่ POS (FEFO เดิม)
CREATE TABLE IF NOT EXISTS visit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  -- วิธีใช้ยา (พิมพ์ลงฉลาก/ใบสรุปการรักษา)
  dosage TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visits_pet_id ON visits(pet_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_visit_date ON visits(visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_visit_items_visit_id ON visit_items(visit_id);

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_items ENABLE ROW LEVEL SECURITY;

-- หมอต้องเขียนได้ (ไม่อยู่ในลิสต์ RESTRICTIVE ของ supabase-migration-clinic.sql)
DROP POLICY IF EXISTS "auth manage visits" ON visits;
CREATE POLICY "auth manage visits" ON visits FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "auth manage visit_items" ON visit_items;
CREATE POLICY "auth manage visit_items" ON visit_items FOR ALL TO authenticated USING (true);
