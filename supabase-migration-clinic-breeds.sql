-- โมดูลคลินิก: ฐานข้อมูลพันธุ์ + วันที่ทำหมัน (2026-07-23)
-- pets.breed ยังเป็น TEXT เก็บ "ชื่อพันธุ์" เหมือนเดิม (แพทเทิร์นเดียวกับ products.unit + ตาราง units)
-- ตาราง breeds เป็นตัวเลือกให้เลือก ไม่ใช่ FK — query/ใบพิมพ์เดิมไม่ต้องแก้

CREATE TABLE IF NOT EXISTS breeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species TEXT NOT NULL CHECK (species IN ('dog', 'cat', 'bird', 'rabbit', 'rodent', 'reptile', 'other')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (species, name)
);

CREATE INDEX IF NOT EXISTS idx_breeds_species ON breeds(species, name);

ALTER TABLE breeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage breeds" ON breeds;
CREATE POLICY "auth manage breeds" ON breeds FOR ALL TO authenticated USING (true);

-- ทำหมันเมื่อไหร่ (เอาไปคำนวณอายุตอนทำหมัน)
ALTER TABLE pets ADD COLUMN IF NOT EXISTS sterilized_date DATE;

INSERT INTO breeds (species, name) VALUES
  ('dog', 'ชิวาวา'), ('dog', 'ปอมเมอเรเนียน'), ('dog', 'ปั๊ก'), ('dog', 'ชิห์สุ'),
  ('dog', 'บีเกิล'), ('dog', 'โกลเด้น รีทรีฟเวอร์'), ('dog', 'ลาบราดอร์ รีทรีฟเวอร์'),
  ('dog', 'ไซบีเรียน ฮัสกี้'), ('dog', 'พุดเดิ้ล'), ('dog', 'ยอร์คเชียร์ เทอร์เรีย'),
  ('dog', 'ชเนาเซอร์'), ('dog', 'เฟรนช์ บูลด็อก'), ('dog', 'อิงลิช บูลด็อก'),
  ('dog', 'ร็อตไวเลอร์'), ('dog', 'เยอรมัน เชพเพิร์ด'), ('dog', 'ดัชชุน'),
  ('dog', 'มอลทีส'), ('dog', 'บิชอง ฟริเซ่'), ('dog', 'คอร์กี้'), ('dog', 'ชเปิร์ซ'),
  ('dog', 'ไทยหลังอาน'), ('dog', 'ไทยบางแก้ว'), ('dog', 'ไทยพันธุ์ผสม'),

  ('cat', 'ไทยวิเชียรมาศ'), ('cat', 'ไทยศุภลักษณ์'), ('cat', 'ไทยโคราช (สีสวาด)'),
  ('cat', 'เปอร์เซีย'), ('cat', 'สก็อตติช โฟลด์'), ('cat', 'บริติช ช็อตแฮร์'),
  ('cat', 'อเมริกัน ช็อตแฮร์'), ('cat', 'เมนคูน'), ('cat', 'เอ็กโซติก ช็อตแฮร์'),
  ('cat', 'แร็กดอลล์'), ('cat', 'สฟิงซ์'), ('cat', 'เบงกอล'), ('cat', 'มันช์กิน'),
  ('cat', 'นอร์วีเจียน ฟอเรสต์'), ('cat', 'แมวไทยพันธุ์ผสม'),

  ('bird', 'นกแก้ว'), ('bird', 'นกหงส์หยก'), ('bird', 'นกค็อกคาเทล'),
  ('bird', 'นกเลิฟเบิร์ด'), ('bird', 'นกมาคอว์'), ('bird', 'นกกระตั้ว'),

  ('rabbit', 'ฮอลแลนด์ ลอป'), ('rabbit', 'เนเธอร์แลนด์ ดวอฟ'), ('rabbit', 'ไลอ้อนเฮด'),
  ('rabbit', 'เร็กซ์'), ('rabbit', 'อังโกร่า'), ('rabbit', 'กระต่ายพันธุ์ผสม'),

  ('rodent', 'แฮมสเตอร์แคระ'), ('rodent', 'แฮมสเตอร์ซีเรีย'), ('rodent', 'หนูตะเภา (แกสบี้)'),
  ('rodent', 'ชูการ์ไกลเดอร์'), ('rodent', 'เม่นแคระ'), ('rodent', 'ชินชิล่า'),

  ('reptile', 'เต่าบก'), ('reptile', 'เต่าน้ำ'), ('reptile', 'อิกัวน่า'),
  ('reptile', 'มังกรเครา (Bearded dragon)'), ('reptile', 'งูข้าวโพด'), ('reptile', 'ตุ๊กแกเสือดาว')
ON CONFLICT (species, name) DO NOTHING;
