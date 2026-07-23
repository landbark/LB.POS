-- โมดูลคลินิก: โปรแกรมวัคซีน (2026-07-23)
-- รันใน Supabase SQL Editor

-- แคตตาล็อกวัคซีน — name = ชื่อแสดงผล "English / ไทย" (แพทเทิร์นเดียวกับ breeds)
-- species = NULL หมายถึงใช้ได้ทุกชนิด (เช่น พิษสุนัขบ้า)
CREATE TABLE IF NOT EXISTS vaccines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  name_en TEXT,
  name_th TEXT,
  species TEXT CHECK (species IN ('dog', 'cat', 'bird', 'rabbit', 'rodent', 'reptile', 'other')),
  -- ระยะกระตุ้นเข็มถัดไป (วัน) — ใช้เป็นค่าตั้งต้นคำนวณวันนัด, แก้ได้ตอนบันทึก
  default_interval_days INT NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ประวัติการฉีดวัคซีนรายตัว
CREATE TABLE IF NOT EXISTS pet_vaccinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  vaccine_id UUID REFERENCES vaccines(id) ON DELETE SET NULL,
  -- snapshot ชื่อวัคซีน ณ วันที่ฉีด (เผื่อแคตตาล็อกถูกแก้/ลบทีหลัง)
  vaccine_name TEXT NOT NULL,
  dose_date DATE NOT NULL,
  dose_label TEXT,
  -- วันนัดเข็มถัดไป (คำนวณจาก interval แต่แก้เองได้; ว่าง = ไม่ต้องกระตุ้น)
  next_due_date DATE,
  lot_number TEXT,
  vet_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pet_vaccinations_pet_id ON pet_vaccinations(pet_id, dose_date DESC);
CREATE INDEX IF NOT EXISTS idx_pet_vaccinations_next_due ON pet_vaccinations(next_due_date) WHERE next_due_date IS NOT NULL;

ALTER TABLE vaccines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_vaccinations ENABLE ROW LEVEL SECURITY;
-- หมอต้องเขียนได้ (ไม่อยู่ในลิสต์ RESTRICTIVE ของ vet)
DROP POLICY IF EXISTS "auth manage vaccines" ON vaccines;
CREATE POLICY "auth manage vaccines" ON vaccines FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "auth manage pet_vaccinations" ON pet_vaccinations;
CREATE POLICY "auth manage pet_vaccinations" ON pet_vaccinations FOR ALL TO authenticated USING (true);

INSERT INTO vaccines (name, name_en, name_th, species, default_interval_days) VALUES
  ('Rabies / พิษสุนัขบ้า', 'Rabies', 'พิษสุนัขบ้า', NULL, 365),
  ('Canine Combined (DHPPL) / วัคซีนรวมสุนัข', 'Canine Combined (DHPPL)', 'วัคซีนรวมสุนัข', 'dog', 365),
  ('Leptospirosis / เลปโตสไปโรซิส', 'Leptospirosis', 'เลปโตสไปโรซิส', 'dog', 365),
  ('Canine Influenza / ไข้หวัดใหญ่สุนัข', 'Canine Influenza', 'ไข้หวัดใหญ่สุนัข', 'dog', 365),
  ('Feline Combined (FVRCP) / วัคซีนรวมแมว', 'Feline Combined (FVRCP)', 'วัคซีนรวมแมว', 'cat', 365),
  ('Feline Leukemia (FeLV) / ลิวคีเมียแมว', 'Feline Leukemia (FeLV)', 'ลิวคีเมียแมว', 'cat', 365),
  ('Rabbit (Myxo/RHD) / วัคซีนกระต่าย', 'Rabbit (Myxo/RHD)', 'วัคซีนกระต่าย', 'rabbit', 365)
ON CONFLICT (name) DO NOTHING;
