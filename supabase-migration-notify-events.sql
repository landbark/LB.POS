-- LANDBARK POS — Migration: แจ้งเตือนเจ้าของทาง Telegram แบบทันเหตุการณ์
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- เดิมมีแต่สรุปรอบเช้า ตอนนี้แยกเปิด/ปิดได้ทีละเหตุการณ์
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_new_order BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_payment_slip BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_shift_close BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_daily_sales BOOLEAN NOT NULL DEFAULT true;

-- เตือนเฉพาะตอนเงินขาด/เกินเกินกี่บาท (0 = เตือนทุกครั้งที่ปิดกะ)
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS cash_diff_threshold NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ผู้รับบางคนอยากได้แค่บางเรื่อง (เจ้าของ = ทุกเรื่อง, พนักงาน = เฉพาะสต็อค)
ALTER TABLE telegram_recipients ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

-- กันส่งซ้ำเมื่อ Vercel retry / ลูกค้ากดสั่งซ้ำ — เก็บ key ของเหตุการณ์ที่ส่งไปแล้ว
CREATE TABLE IF NOT EXISTS notify_log (
  event_key TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notify_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read" ON notify_log;
CREATE POLICY "authenticated_read" ON notify_log FOR SELECT TO authenticated USING (true);
