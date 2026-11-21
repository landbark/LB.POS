-- LANDBARK POS — Migration: ช่องทางคืนเงินให้ครบทุกทาง + แก้ช่องทางคืนเงินย้อนหลังได้
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
--
-- ของเดิมให้เลือกคืนได้แค่ เงินสด / โอน / เครดิต — บิลที่ลูกค้าจ่ายด้วยบัตรหรือ QR
-- จึงไม่มีช่องที่ตรงให้กด คนคีย์เลยกดเงินสดไว้ แล้วสรุปกะหักเงินออกจากเก๊ะทั้งที่เงินไม่ได้ออก

-- 1) เปิดรับ card / qr เพิ่ม — ดรอป CHECK เดิมของคอลัมน์นี้ทุกชื่อ (ชื่อที่ Postgres ตั้งให้ต่างกันได้)
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('transactions'::regclass, 'returns'::regclass)
      AND pg_get_constraintdef(oid) ILIKE '%refund_method%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

ALTER TABLE transactions ADD CONSTRAINT transactions_refund_method_check
  CHECK (refund_method IS NULL OR refund_method IN ('cash', 'transfer', 'card', 'qr', 'credit'));

ALTER TABLE returns ADD CONSTRAINT returns_refund_method_check
  CHECK (refund_method IS NULL OR refund_method IN ('cash', 'transfer', 'card', 'qr', 'credit'));

-- 2) ร่องรอยการแก้ช่องทางคืนเงินทีหลัง — เก็บค่าที่กดไว้ตอนยกเลิกจริง + ใครแก้เมื่อไหร่
--    (รูปแบบเดียวกับ payment_method_original ของการแก้วิธีรับเงินในบิลปกติ)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS refund_method_original TEXT,
  ADD COLUMN IF NOT EXISTS refund_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_edited_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
