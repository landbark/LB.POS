-- โมดูลคลินิก: เอกสารคลินิกที่กรอก + เซฟติด HN (2026-11-09)
--
-- เดิม /print/consent, /print/referral, /print/treatment-form เป็นฟอร์มเปล่า กรอกแล้วพิมพ์เลย
-- ไม่ได้เก็บอะไรไว้ → ย้อนดูไม่ได้ว่าเคยออกใบส่งตัว/ใบยินยอมอะไรให้สัตว์ตัวไหน
--
-- ใหม่: กรอกในระบบ → เซฟเป็นแถวใน clinic_documents (ผูก pet_id + visit_id) → พิมพ์/บันทึกเป็น PDF
-- ทุกช่องเก็บเป็น JSONB (data) เพราะแต่ละชนิดเอกสารมีช่องไม่เหมือนกัน และนิยามช่องอยู่ใน
-- src/lib/clinicDocs.ts — เพิ่มชนิดเอกสารใหม่ไม่ต้องแก้ตาราง
--
-- แก้ไขได้ 24 ชม. แรกเท่านั้น (trigger บังคับที่ DB ไม่ใช่แค่ซ่อนปุ่ม) — เอกสารที่เซ็นแล้ว
-- ส่งออกไปอยู่กับคลินิกอื่น/เจ้าของแล้ว แก้ย้อนหลังไม่ได้
--
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

CREATE TABLE IF NOT EXISTS clinic_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- เลขที่เอกสาร เช่น REF091120260001 — trigger ออกให้ตอน insert (ดู next_clinic_doc_number)
  -- ไม่ใส่ NOT NULL เพราะฝั่งเว็บ insert มาโดยไม่ส่งคอลัมน์นี้ แล้วให้ trigger เติม
  doc_number TEXT UNIQUE,
  -- ชนิดเอกสาร ตรงกับคีย์ใน src/lib/clinicDocs.ts (referral, consent_surgery, ...)
  -- ไม่ใส่ CHECK รายชนิด เพราะเพิ่มชนิดใหม่ในโค้ดแล้วต้องใช้ได้เลยโดยไม่ต้องรัน migration อีก
  doc_type TEXT NOT NULL,
  -- ติดตัวสัตว์ (HN) เป็นหลัก — visit คือใบตรวจที่ออกเอกสารนี้ (ออกจากหน้าสัตว์เลยก็ได้ = NULL)
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  -- ค่าทุกช่องในฟอร์ม {"to_clinic": "...", "reason": "..."}
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- บรรทัดสรุปสำหรับลิสต์ประวัติ (เช่น "ส่งไป รพ.สัตว์ ก. — ผ่าตัดกระดูก")
  summary TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_documents_pet ON clinic_documents(pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_documents_visit ON clinic_documents(visit_id);

-- ── เลขที่เอกสาร ─────────────────────────────────────────────────────────────
-- prefix ตามชนิดเอกสาร + วันเดือนปีค.ศ. (เวลาไทย) + ลำดับ 4 หลัก รีเซ็ตรายวัน
-- (แพทเทิร์นเดียวกับ next_visit_number แต่ prefix แปรตามชนิด)
CREATE OR REPLACE FUNCTION public.clinic_doc_prefix(p_type text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_type = 'referral' THEN 'REF'
    WHEN p_type = 'treatment_summary' THEN 'TRT'
    WHEN p_type = 'health_cert' THEN 'HLT'
    WHEN p_type LIKE 'consent%' THEN 'CSN'
    ELSE 'DOC'
  END;
$$;

CREATE OR REPLACE FUNCTION public.next_clinic_doc_number(p_type text)
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  prefix text := public.clinic_doc_prefix(p_type) || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'DDMMYYYY');
  seq int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(doc_number FROM length(prefix) + 1)::int), 0) + 1
  INTO seq
  FROM clinic_documents
  WHERE doc_number LIKE prefix || '%'
    AND SUBSTRING(doc_number FROM length(prefix) + 1) ~ '^[0-9]+$';
  RETURN prefix || LPAD(seq::text, 4, '0');
END;
$$;

-- ── กฎของเอกสาร: ออกเลขให้ตอน insert + ล็อกหลัง 24 ชม. ───────────────────────
-- ล็อกที่ DB เพราะหน้าเว็บคุยกับ Supabase ตรง ๆ ด้วย JWT ของพนักงาน (ซ่อนปุ่มอย่างเดียวกันไม่ได้จริง)
CREATE OR REPLACE FUNCTION public.clinic_documents_guard()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.doc_number IS NULL OR NEW.doc_number = '' THEN
      NEW.doc_number := public.next_clinic_doc_number(NEW.doc_type);
    END IF;
    NEW.created_at := NOW();
    NEW.updated_at := NEW.created_at;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.created_at < NOW() - INTERVAL '24 hours' THEN
      RAISE EXCEPTION 'เอกสารออกไปเกิน 24 ชั่วโมงแล้ว แก้ไขไม่ได้ (%)', OLD.doc_number;
    END IF;
    -- ห้ามขยับของที่ใช้คิดเวลา/อ้างอิง ไม่ให้ยืดอายุแก้ไขหรือสลับเจ้าของเอกสาร
    NEW.doc_number := OLD.doc_number;
    NEW.doc_type := OLD.doc_type;
    NEW.pet_id := OLD.pet_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- DELETE: ยกเลิกใบที่ออกผิดได้ใน 24 ชม. เท่ากับการแก้
  IF OLD.created_at < NOW() - INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'เอกสารออกไปเกิน 24 ชั่วโมงแล้ว ลบไม่ได้ (%)', OLD.doc_number;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinic_documents_guard ON clinic_documents;
CREATE TRIGGER trg_clinic_documents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON clinic_documents
  FOR EACH ROW EXECUTE FUNCTION public.clinic_documents_guard();

-- เผื่อรันทับตารางที่สร้างไว้ก่อนแล้วมี NOT NULL ติดมา
ALTER TABLE clinic_documents ALTER COLUMN doc_number DROP NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE clinic_documents ENABLE ROW LEVEL SECURITY;

-- พนักงานที่อนุมัติแล้วใช้ได้ทุก role (แคชเชียร์เปิดดู/พิมพ์ซ้ำให้เจ้าของได้) — ปุ่ม "ออกเอกสาร"
-- เปิดให้หมอ/แอดมินที่หน้าเว็บ
DROP POLICY IF EXISTS "auth manage clinic_documents" ON clinic_documents;
CREATE POLICY "auth manage clinic_documents" ON clinic_documents
  FOR ALL TO authenticated USING (true);

-- ต้องเป็นพนักงานที่อนุมัติแล้ว (แบบเดียวกับ supabase-migration-rls-active-staff.sql
-- ซึ่งวน ALTER เฉพาะตารางที่มีอยู่ตอนรัน — ตารางใหม่ต้องใส่เอง)
DROP POLICY IF EXISTS "active staff only" ON clinic_documents;
CREATE POLICY "active staff only" ON clinic_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());
