-- LANDBARK POS — Migration: บิลเดียวเก็บเงินหลายทาง (เช่น ลูกค้าโอน ฿57 + จ่ายสด ฿2)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม ไม่ต้อง backfill)
--
-- บิลที่จ่ายทางเดียวจะ "ไม่มี" แถวในตารางนี้เลย รวมถึงบิลเก่าทั้งหมด — ให้ไปอ่าน
-- transactions.payment_method เหมือนเดิม โค้ดฝั่งแอปจึงไม่ต้องแก้ทุกจุดพร้อมกัน
--
-- บิลที่แยกจ่ายจะมีแถวช่องทางละแถว และผลรวม amount ต้องเท่ากับ transactions.total พอดี
-- เงินสดที่รับเกินมาเป็นเงินทอน ไม่นับเข้าตารางนี้ (ยังอยู่ที่ cash_received / change_given ตามเดิม)
-- ส่วน transactions.payment_method ของบิลแบบนี้จะเก็บช่องทางที่ยอดเยอะสุดไว้ เพื่อให้หน้า/รายงาน
-- ที่ยังอ่านคอลัมน์เดิมอยู่ไม่พัง แค่เห็นไม่ละเอียดเท่านั้น

CREATE TABLE IF NOT EXISTS transaction_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer', 'card', 'qr')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- ช่องทางละแถวเดียวต่อบิล — กันยอดซ้ำซ้อนตอนรวมรายงาน และทำให้ UI คิดเงินทอนได้ตรงไปตรงมา
  UNIQUE (transaction_id, method)
);

CREATE INDEX IF NOT EXISTS idx_transaction_payments_transaction ON transaction_payments(transaction_id);

ALTER TABLE transaction_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth manage transaction_payments" ON transaction_payments;
CREATE POLICY "auth manage transaction_payments" ON transaction_payments
  FOR ALL TO authenticated USING (true);

-- ใบเสร็จลบไม่ได้ (ยกเลิกได้อย่างเดียว) รายการจ่ายของมันก็ต้องลบไม่ได้เหมือนกัน
DROP POLICY IF EXISTS "no delete transaction_payments" ON transaction_payments;
CREATE POLICY "no delete transaction_payments" ON transaction_payments
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
