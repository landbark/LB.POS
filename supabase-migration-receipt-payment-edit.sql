-- LANDBARK POS — Migration: แก้วิธีรับเงินในใบเสร็จ + ห้ามลบใบเสร็จ
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- ── 1. ร่องรอยการแก้วิธีรับเงิน ───────────────────────────────────────────────
-- payment_method_original = ค่าที่บันทึกตอนขายครั้งแรก (เซ็ตครั้งเดียว ไม่ทับ)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_method_original TEXT
    CHECK (payment_method_original IN ('cash', 'transfer', 'card', 'qr')),
  ADD COLUMN IF NOT EXISTS payment_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_edited_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ── 2. ห้ามลบใบเสร็จ — ยกเลิกได้เท่านั้น ──────────────────────────────────────
-- policy เดิม "auth manage transactions" เป็น FOR ALL จึงเปิด DELETE ให้พนักงานทุกคน
-- ทับด้วย RESTRICTIVE (AND กับทุก policy) ให้ DELETE เป็นเท็จเสมอ
-- service role ไม่ผ่าน RLS → สคริปต์แบ็กอัป/ดูแลระบบยังทำงานได้ปกติ
DROP POLICY IF EXISTS "no delete transactions" ON transactions;
CREATE POLICY "no delete transactions" ON transactions
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "no delete transaction_items" ON transaction_items;
CREATE POLICY "no delete transaction_items" ON transaction_items
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
