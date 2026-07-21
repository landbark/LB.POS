-- ย้ายแจ้งเตือนแอดมิน (สต็อคต่ำ/ใกล้หมดอายุ) จาก LINE → Telegram
-- รันใน Supabase SQL Editor

-- ผู้รับแจ้งเตือนทาง Telegram (chat_id ได้จากตอนพิมพ์ /start หาบอท)
CREATE TABLE IF NOT EXISTS telegram_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE telegram_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON telegram_recipients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ตารางตั้งค่าเดิม (enabled/expiry_days) ใช้ต่อได้ แค่เปลี่ยนชื่อให้ไม่ผูกกับ LINE
ALTER TABLE IF EXISTS line_notify_settings RENAME TO notify_settings;

-- เผื่อ DB ที่ยังไม่เคยมีตารางตั้งค่า (สร้างใหม่ให้เลย)
CREATE TABLE IF NOT EXISTS notify_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT true,
  expiry_days INT NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO notify_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE notify_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON notify_settings;
CREATE POLICY "authenticated_all" ON notify_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- เลิกใช้ผู้รับทาง LINE
DROP TABLE IF EXISTS line_notify_recipients;
