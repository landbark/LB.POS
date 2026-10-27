-- โมดูลคลินิก: ฐานข้อมูลชื่อโรค (2026-10-27)
-- เดิม visits.diagnosis เป็น TEXT พิมพ์มือ → ชื่อโรคเดียวกันเขียนไม่เหมือนกัน (wound / bite wound / Bite Wound Abscess)
-- ใหม่: ตาราง diagnoses เป็นแคตตาล็อก + visit_diagnoses ผูกแบบหลายโรคต่อหนึ่ง visit (FK จริง เพราะต้อง merge ได้)
-- visits.diagnosis ยังอยู่ แต่เปลี่ยนความหมายเป็น "รายละเอียดเพิ่มเติม" ที่หมอพิมพ์เอง

CREATE TABLE IF NOT EXISTS diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  /** ชื่อแสดงผล compose จาก "English / ไทย" เหมือน breeds/vaccines */
  name TEXT NOT NULL,
  name_en TEXT,
  name_th TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- กันชื่อซ้ำแบบไม่สนตัวพิมพ์ใหญ่เล็ก (CKD / ckd ต้องเป็นตัวเดียวกัน)
CREATE UNIQUE INDEX IF NOT EXISTS idx_diagnoses_name_lower ON diagnoses (lower(name));

CREATE TABLE IF NOT EXISTS visit_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  -- RESTRICT ไม่ใช่ CASCADE: ลบโรคที่เคยใช้แล้วต้องไม่ลบประวัติทิ้งเงียบๆ — ให้ merge แทน
  diagnosis_id UUID NOT NULL REFERENCES diagnoses(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (visit_id, diagnosis_id)
);

CREATE INDEX IF NOT EXISTS idx_visit_diagnoses_visit ON visit_diagnoses(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_diagnoses_diagnosis ON visit_diagnoses(diagnosis_id);

ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage diagnoses" ON diagnoses;
CREATE POLICY "auth manage diagnoses" ON diagnoses FOR ALL TO authenticated USING (true);

ALTER TABLE visit_diagnoses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage visit_diagnoses" ON visit_diagnoses;
CREATE POLICY "auth manage visit_diagnoses" ON visit_diagnoses FOR ALL TO authenticated USING (true);

-- รวมโรคที่เพิ่มผิด/ซ้ำกันเข้าเป็นตัวเดียว: ย้ายทุก visit ของ p_sources ไปอยู่กับ p_target แล้วลบต้นทาง
-- ทำเป็นฟังก์ชันเพราะต้อง atomic (ย้าย+ลบครึ่งทางแล้วค้างคือประวัติหาย) และมี RESTRICT คุมอยู่
CREATE OR REPLACE FUNCTION merge_diagnoses(p_target UUID, p_sources UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INT;
BEGIN
  IF p_target = ANY(p_sources) THEN
    RAISE EXCEPTION 'merge_diagnoses: โรคปลายทางซ้ำกับต้นทาง';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM diagnoses WHERE id = p_target) THEN
    RAISE EXCEPTION 'merge_diagnoses: ไม่พบโรคปลายทาง';
  END IF;

  SELECT COUNT(DISTINCT visit_id) INTO affected
    FROM visit_diagnoses WHERE diagnosis_id = ANY(p_sources);

  -- DISTINCT + DO NOTHING ครอบทุกกรณี: visit ที่มีปลายทางอยู่แล้ว และ visit ที่ติดหลายต้นทางพร้อมกัน
  INSERT INTO visit_diagnoses (visit_id, diagnosis_id)
  SELECT DISTINCT visit_id, p_target FROM visit_diagnoses WHERE diagnosis_id = ANY(p_sources)
  ON CONFLICT (visit_id, diagnosis_id) DO NOTHING;

  DELETE FROM visit_diagnoses WHERE diagnosis_id = ANY(p_sources);
  DELETE FROM diagnoses WHERE id = ANY(p_sources);

  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION merge_diagnoses(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_diagnoses(UUID, UUID[]) TO authenticated;

-- ย้ายข้อความวินิจฉัยเดิมเข้าแคตตาล็อก (ตอนรัน prod มี 13 visit / 9 ข้อความ)
-- ข้อความยาวเกิน 80 ตัวอักษรถือว่าเป็นคำบรรยาย ไม่ใช่ชื่อโรค → ปล่อยไว้ในช่องรายละเอียดเพิ่มเติม
INSERT INTO diagnoses (name, name_en, name_th)
SELECT n,
       CASE WHEN n ~ '[ก-๛]' THEN NULL ELSE n END,
       CASE WHEN n ~ '[ก-๛]' THEN n ELSE NULL END
  FROM (
    SELECT DISTINCT btrim(diagnosis) AS n
      FROM visits
     WHERE btrim(COALESCE(diagnosis, '')) <> ''
       AND length(btrim(diagnosis)) <= 80
  ) s
ON CONFLICT (lower(name)) DO NOTHING;

INSERT INTO visit_diagnoses (visit_id, diagnosis_id)
SELECT v.id, d.id
  FROM visits v
  JOIN diagnoses d ON lower(d.name) = lower(btrim(v.diagnosis))
ON CONFLICT (visit_id, diagnosis_id) DO NOTHING;

-- ข้อความที่กลายเป็นชื่อโรคไปแล้ว ไม่ต้องค้างในช่องรายละเอียดอีก (ไม่งั้นโชว์ซ้ำสองที่)
UPDATE visits v
   SET diagnosis = NULL
 WHERE EXISTS (SELECT 1 FROM diagnoses d WHERE lower(d.name) = lower(btrim(v.diagnosis)));
