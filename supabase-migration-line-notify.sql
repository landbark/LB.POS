-- แจ้งเตือน LINE: สต็อคต่ำ / ใกล้หมดอายุ (Phase 3)
-- รันใน Supabase SQL Editor

-- พนักงานที่เชื่อมบัญชี LINE ไว้รับแจ้งเตือน
CREATE TABLE IF NOT EXISTS line_notify_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ตั้งค่าแจ้งเตือน (แถวเดียว)
CREATE TABLE IF NOT EXISTS line_notify_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT true,
  expiry_days INT NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO line_notify_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE line_notify_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_notify_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON line_notify_recipients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON line_notify_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
