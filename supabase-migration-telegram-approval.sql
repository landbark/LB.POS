-- ผู้ขอรับแจ้งเตือน Telegram ต้องรอแอดมินอนุมัติก่อน (กันคนนอกสมัครเอง)
-- รันใน Supabase SQL Editor (ต่อจาก supabase-migration-telegram-notify.sql)

ALTER TABLE telegram_recipients
  ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;
