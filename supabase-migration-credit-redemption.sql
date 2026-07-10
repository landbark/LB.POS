-- LANDBARK POS — Migration: ใช้เครดิตตอนจ่ายเงิน
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS credit_used NUMERIC(12,2) NOT NULL DEFAULT 0;
