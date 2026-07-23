-- โมดูลคลินิก ก้อนที่ 3: นัดหมาย (2026-07-23)
-- รันใน Supabase SQL Editor

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  vet_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  -- ประเภทนัด: ตรวจ / วัคซีน / ผ่าตัด / ติดตามอาการ / อื่นๆ
  type TEXT NOT NULL DEFAULT 'checkup' CHECK (type IN ('checkup', 'vaccine', 'surgery', 'follow_up', 'other')),
  -- นัดแล้ว / มาแล้ว / ไม่มา / ยกเลิก
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'missed', 'cancelled')),
  notes TEXT,
  -- ผูกกับเวชระเบียนที่สร้างนัดนี้ (นัดติดตามจากหน้า OPD)
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_pet_id ON appointments(pet_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
-- หมอต้องเขียนได้ จึงเป็น permissive ธรรมดา (ไม่อยู่ในลิสต์ RESTRICTIVE ของ vet)
DROP POLICY IF EXISTS "auth manage appointments" ON appointments;
CREATE POLICY "auth manage appointments" ON appointments FOR ALL TO authenticated USING (true);
