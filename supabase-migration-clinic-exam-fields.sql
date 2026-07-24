-- เพิ่มหัวข้อบันทึกการตรวจแบบมาตรฐาน (SOAP) ให้เวชระเบียน
-- Chief Complaint = symptoms (เดิม), Treatment = treatment (เดิม), Assessment = diagnosis (เดิม)
-- เพิ่มใหม่: History Taking, Physical Examination, Client Education
ALTER TABLE visits ADD COLUMN IF NOT EXISTS history_taking TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS physical_exam TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS client_education TEXT;
