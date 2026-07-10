-- LANDBARK POS — Migration: ยกเลิกใบเสร็จ (คืนสต็อค + คืนเงิน/เครดิต)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- สถานะ + ข้อมูลการยกเลิกใบเสร็จ
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS restocked BOOLEAN,
  ADD COLUMN IF NOT EXISTS refund_method TEXT CHECK (refund_method IN ('cash', 'transfer', 'credit'));

-- เครดิตร้าน — คืนเงินเป็นเครดิตสะสมให้ลูกค้าสมาชิก (แทนเงินสด/โอน)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ผูก stock_movements กับใบเสร็จโดยตรง (แทนการเทียบ reason เป็น string) + เพิ่มประเภท cancel สำหรับคืนสต็อค
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN ('sale', 'receive', 'adjust_in', 'adjust_out', 'cancel'));

-- backfill: ผูกรายการขายเก่าเข้ากับใบเสร็จ จากเลขที่รายการที่เคยเก็บไว้ใน reason
UPDATE stock_movements sm
SET transaction_id = t.id
FROM transactions t
WHERE sm.type = 'sale' AND sm.transaction_id IS NULL AND sm.reason = t.transaction_number;
