-- แนบรูปในเวชระเบียน (2026-11-08)
-- รูปแผล/ผลแล็บ/ฟิล์ม/เอกสารที่ถ่ายไว้ — แนบตอนตรวจก็ได้ แนบย้อนหลังก็ได้
-- แคชเชียร์แนบได้ด้วย (ช่องอื่นในเวชระเบียนยังดูอย่างเดียวเหมือนเดิม)
--
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

CREATE TABLE IF NOT EXISTS visit_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  -- path ในบัคเก็ต visit-attachments (บัคเก็ตส่วนตัว — อ่านผ่าน signed URL ฝั่ง server)
  path TEXT NOT NULL,
  -- คำอธิบายสั้น ๆ เช่น "แผลหลังผ่า" / "ผลเลือด 8 พ.ย."
  caption TEXT,
  width INT,
  height INT,
  size INT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_attachments_visit ON visit_attachments(visit_id, created_at);

ALTER TABLE visit_attachments ENABLE ROW LEVEL SECURITY;

-- อ่าน/เขียนได้ทุก role ที่เป็นพนักงาน — การลบคุมที่ API (คนอัปโหลดเอง หรือหมอ/แอดมิน)
DROP POLICY IF EXISTS "auth manage visit_attachments" ON visit_attachments;
CREATE POLICY "auth manage visit_attachments" ON visit_attachments
  FOR ALL TO authenticated USING (true);

-- ต้องเป็นพนักงานที่อนุมัติแล้ว (แบบเดียวกับ supabase-migration-rls-active-staff.sql)
DROP POLICY IF EXISTS "active staff only" ON visit_attachments;
CREATE POLICY "active staff only" ON visit_attachments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());

-- ไม่ใส่ policy "vet readonly delete" ให้ตารางนี้ — รูปที่แนบผิดต้องลบออกได้

-- ---------------------------------------------------------------
-- Storage: รูปแนบเวชระเบียน — บัคเก็ตส่วนตัว (ไม่ public)
-- รูปถูกย่อ + บีบเป็น WebP ฝั่งเบราว์เซอร์แล้ว จึงจำกัดไว้ 3MB
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('visit-attachments', 'visit-attachments', false, 3145728)
ON CONFLICT (id) DO NOTHING;
