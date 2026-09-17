-- LANDBARK POS — Migration: ให้เจ้าของสัตว์รับแจ้งเตือนนัดทาง Telegram
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- chat id ของลูกค้าใน Telegram (ผูกผ่าน deep link จากหน้าสมาชิก)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;

-- ลูกค้าปิดรับแจ้งเตือนเองได้ โดยไม่ต้องตัดการเชื่อมต่อทิ้ง
ALTER TABLE customers ADD COLUMN IF NOT EXISTS telegram_notify BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS customers_telegram_chat_id_key
  ON customers(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- โทเคนชั่วคราวสำหรับ deep link t.me/<bot>?start=<token>
-- Telegram จำกัด start param ที่ 64 ตัว [A-Za-z0-9_-] จึงใช้ hex 32 ตัว
CREATE TABLE IF NOT EXISTS customer_telegram_tokens (
  token TEXT PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_telegram_tokens_customer
  ON customer_telegram_tokens(customer_id);

-- อ่าน/เขียนผ่าน service role เท่านั้น (หน้าเว็บลูกค้าไม่มี session Supabase)
ALTER TABLE customer_telegram_tokens ENABLE ROW LEVEL SECURITY;

-- กันส่งเตือนนัดซ้ำในวันเดียวกัน
CREATE TABLE IF NOT EXISTS appointment_reminder_log (
  reminder_key TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE appointment_reminder_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read" ON appointment_reminder_log;
CREATE POLICY "authenticated_read" ON appointment_reminder_log FOR SELECT TO authenticated USING (true);

-- เปิด/ปิดการเตือนนัดให้ลูกค้าจากหน้าแจ้งเตือนในหลังร้าน
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_customer_appointment BOOLEAN NOT NULL DEFAULT true;
