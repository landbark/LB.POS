-- เปิด/ปิดระบบสะสมแต้ม (2026-07-22)
-- ปิดแล้วลูกค้าจะไม่ได้แต้มเพิ่มและใช้แต้มไม่ได้ แต่แต้มเดิมที่สะสมไว้ยังอยู่ครบ
ALTER TABLE points_config
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
