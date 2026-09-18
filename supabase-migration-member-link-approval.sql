-- ================================================================
-- LANDBARK POS — ผูกบัญชีสมาชิกต้องให้ทางร้านยืนยันก่อน
--
-- เดิม: ลูกค้ากรอกเบอร์ในหน้า LIFF แล้วผูกได้เลย
--       → ใครรู้เบอร์ลูกค้าคนอื่น ก็ผูก LINE ตัวเองเข้ากับบัญชีนั้นได้
--         แล้วดูประวัติการซื้อกับแต้มของเขา
--
-- ใหม่: คำขอเข้าคิวรอ ร้านกดยืนยันก่อน (เจ้าของร้านหรือพนักงานก็ได้)
--       ที่หน้า ลูกค้า (/admin/customers)
--
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
-- ================================================================

CREATE TABLE IF NOT EXISTS member_link_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- LINE user id ที่ยืนยันแล้วจาก ID token (ไม่ใช่ค่าที่ client ส่งมาเฉย ๆ)
  line_user_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- หนึ่ง LINE account ค้างคำขอได้ทีละใบ (กดซ้ำ = ทับใบเดิม)
CREATE UNIQUE INDEX IF NOT EXISTS member_link_requests_one_pending
  ON member_link_requests(line_user_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_member_link_requests_pending
  ON member_link_requests(status, created_at DESC);

ALTER TABLE member_link_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth manage member_link_requests" ON member_link_requests;
CREATE POLICY "auth manage member_link_requests" ON member_link_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ตารางใหม่ต้องใส่ policy นี้เองทุกครั้ง — DO block ใน
-- supabase-migration-rls-active-staff.sql ทำงานกับตารางที่มีอยู่ ณ ตอนรันเท่านั้น
DROP POLICY IF EXISTS "active staff only" ON member_link_requests;
CREATE POLICY "active staff only" ON member_link_requests
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());
