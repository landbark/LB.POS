-- LANDBARK POS — Migration: รับคืน / เปลี่ยนสินค้าบางรายการ
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
--
-- ของเดิมมีแต่ "ยกเลิกใบเสร็จทั้งใบ" ซึ่งใช้กับเคสที่เจอบ่อยที่สุดไม่ได้เลย:
-- ลูกค้าเอาของกลับมาเปลี่ยนตัวเดียวจากบิลที่มีห้ารายการ แล้วเติมเงินส่วนต่าง
-- ยกเลิกทั้งใบทำให้ยอดขายของ "วันที่ขาย" หายไปทั้งบิล ทั้งที่อีกสี่รายการลูกค้าเอาไปแล้ว
--
-- ใบคืน (returns) แก้ตรงนั้น: คืนเฉพาะรายการที่รับคืนจริง บิลเดิมยังอยู่ครบ
-- แล้วมูลค่าของที่รับคืนเอาไปทำได้ 3 ทาง — คืนเงินสด / โอน / เก็บเป็นเครดิต
-- หรือ "หักกับบิลใหม่" (เปลี่ยนสินค้า) ซึ่งเป็นเคสที่ถามกันมา

-- หัวใบคืน
--
-- return_value  = มูลค่าของที่รับคืนรวม (คิดตามสัดส่วนเงินที่ลูกค้าจ่ายจริงในบิลเดิม)
-- offset_amount = ส่วนที่เอาไปหักบิลใหม่ (เปลี่ยนสินค้า) · 0 = คืนของล้วน ไม่ได้ซื้อใหม่
-- refund_amount = ส่วนที่คืนให้ลูกค้าจริง = return_value − offset_amount
--                 (ของใหม่ถูกกว่าของเดิม → เหลือเป็นเงินคืน/เครดิต ไม่ปล่อยค้าง)
CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number TEXT NOT NULL UNIQUE,
  -- บิลเดิมที่รับของคืน — ห้ามลบบิลทิ้งแล้วเหลือใบคืนลอย
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  -- บิลใหม่ที่เกิดจากการเปลี่ยนสินค้า (NULL = คืนของล้วน)
  exchange_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,

  return_value NUMERIC(12,2) NOT NULL CHECK (return_value >= 0),
  offset_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (offset_amount >= 0),
  refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  -- วิธีคืนเงินส่วนที่เหลือ · NULL = ไม่มีเงินคืน (หักกับบิลใหม่พอดี)
  refund_method TEXT CHECK (refund_method IN ('cash', 'transfer', 'credit')),

  -- แต้ม/ยอดสะสมที่ถอนคืนจากบิลเดิม — เก็บไว้ให้ตรวจย้อนได้ว่าหักไปเท่าไหร่
  points_revoked INT NOT NULL DEFAULT 0,
  points_refunded INT NOT NULL DEFAULT 0,

  restocked BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_returns_transaction ON returns(transaction_id);
CREATE INDEX IF NOT EXISTS idx_returns_exchange ON returns(exchange_transaction_id);
CREATE INDEX IF NOT EXISTS idx_returns_created ON returns(created_at DESC);

-- รายการที่รับคืน — ผูกกับบรรทัดในบิลเดิม เพื่อกันคืนเกินจำนวนที่ขายไป
CREATE TABLE IF NOT EXISTS return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  transaction_item_id UUID REFERENCES transaction_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  -- จำนวนในหน่วยที่ขาย (2 กล่อง = 2) · base_quantity คือจำนวนหน่วยฐานที่คืนเข้าสต็อค
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_factor INT NOT NULL DEFAULT 1 CHECK (unit_factor > 0),
  unit_name TEXT,
  base_quantity INT GENERATED ALWAYS AS (quantity * unit_factor) STORED,
  -- มูลค่าที่คืนให้บรรทัดนี้ (คิดสัดส่วนส่วนลดท้ายบิลแล้ว)
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- ของแลกแต้ม: ไม่มีเงินคืน คืนเป็นแต้มกลับเข้าบัญชีลูกค้า
  reward_points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_tx_item ON return_items(transaction_item_id);

-- เลขที่ใบคืน RTddmmyyyy9999 — รูปแบบเดียวกับใบเสร็จ (RC) และรีเซ็ตรายวันเหมือนกัน
CREATE OR REPLACE FUNCTION public.next_return_number(p_at timestamptz DEFAULT now())
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  prefix text := 'RT' || to_char(p_at AT TIME ZONE 'Asia/Bangkok', 'DDMMYYYY');
  seq int;
BEGIN
  -- กันเลขชนตอนสองเครื่องกดพร้อมกัน — ล็อกชื่อเดียวกันทั้งวัน ปล่อยเมื่อ transaction จบ
  PERFORM pg_advisory_xact_lock(hashtext('return_number:' || prefix));
  SELECT COALESCE(MAX(SUBSTRING(return_number FROM 11)::int), 0) + 1
  INTO seq
  FROM returns
  WHERE return_number LIKE prefix || '%';
  RETURN prefix || LPAD(seq::text, 4, '0');
END;
$$;

-- ประวัติสต็อคได้ประเภทใหม่ 'return' แยกจาก 'cancel' (ยกเลิกทั้งใบ) เพื่ออ่านรายงานย้อนหลังได้ว่าอันไหนคืนบางส่วน
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN ('sale', 'receive', 'adjust_in', 'adjust_out', 'cancel', 'return'));

-- ผูกแถวคืนสต็อคกับใบคืน — ไม่งั้นต้องเดาจาก reason เป็น string เหมือนของเก่า
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS return_id UUID REFERENCES returns(id) ON DELETE SET NULL;

-- มูลค่าของที่รับคืนที่เอามาหักบิลนี้ — ทำงานเหมือน credit_used ที่มีอยู่แล้ว
-- (total ของบิลเก็บ "เงินที่รับจริง" เสมอ ไม่รวมส่วนที่หักด้วยเครดิต/ของที่คืน)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS return_credit NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth manage returns" ON returns;
CREATE POLICY "auth manage returns" ON returns FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "auth manage return_items" ON return_items;
CREATE POLICY "auth manage return_items" ON return_items FOR ALL TO authenticated USING (true);

-- ตารางใหม่ต้องมี policy "active staff only" ด้วย (event trigger ใส่ให้เอง แต่เรียกซ้ำกันพลาด)
SELECT public.apply_active_staff_policy();

-- ── รายงาน VAT ต้องหักใบคืนออก ────────────────────────────────────────────────
--
-- ของเดิมคิดยอดต่อเดือนจาก transactions.total แล้วเกลี่ยตามสัดส่วนสินค้าที่ติด VAT
-- บิลเปลี่ยนสินค้าไม่ต้องทำอะไรเพิ่ม เพราะ total ของบิลใหม่เป็น "เงินที่รับจริง"
-- (หักมูลค่าของที่คืนไปแล้ว) ยอดรวมสองบิลจึงเท่ากับยอดสุทธิที่ลูกค้าซื้อจริงพอดี
--
-- ที่ต้องหักคือ "เงินที่จ่ายคืนลูกค้าจริง" (refund_amount) ของใบคืนที่ไม่ได้เอาไปหัก
-- บิลใหม่ — คืนของล้วนหรือของใหม่ถูกกว่า ไม่มีบิลไหนในระบบสะท้อนเงินก้อนนี้เลย
-- หักในเดือนที่ออกใบคืน ไม่ย้อนไปแก้เดือนที่ขาย (หลักเดียวกับใบลดหนี้)
CREATE OR REPLACE FUNCTION public.vat_sales_by_month(p_year int)
RETURNS TABLE (month int, vat_sales numeric, non_vat_sales numeric, bill_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_bill AS (
    SELECT
      t.id,
      t.total,
      EXTRACT(MONTH FROM t.created_at AT TIME ZONE 'Asia/Bangkok')::int AS m,
      SUM(ti.subtotal) AS items_total,
      SUM(CASE WHEN ti.vat_applicable THEN ti.subtotal ELSE 0 END) AS vat_items
    FROM transactions t
    JOIN transaction_items ti ON ti.transaction_id = t.id
    WHERE t.status IS DISTINCT FROM 'cancelled'
      AND EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok') = p_year
    GROUP BY t.id, t.total, m
  ),
  -- สัดส่วน VAT ของของที่รับคืนในใบนั้น ๆ (ดูจากธง vat_applicable ของบรรทัดเดิมในบิลเก่า)
  per_return AS (
    SELECT
      r.id,
      r.refund_amount,
      EXTRACT(MONTH FROM r.created_at AT TIME ZONE 'Asia/Bangkok')::int AS m,
      SUM(ri.amount) AS items_total,
      SUM(CASE WHEN ti.vat_applicable THEN ri.amount ELSE 0 END) AS vat_items
    FROM returns r
    JOIN return_items ri ON ri.return_id = r.id
    LEFT JOIN transaction_items ti ON ti.id = ri.transaction_item_id
    WHERE r.refund_amount > 0
      AND EXTRACT(YEAR FROM r.created_at AT TIME ZONE 'Asia/Bangkok') = p_year
    GROUP BY r.id, r.refund_amount, m
  ),
  legs AS (
    SELECT
      m,
      total * CASE WHEN items_total > 0 THEN vat_items / items_total ELSE 0 END AS vat_part,
      total * CASE WHEN items_total > 0 THEN 1 - (vat_items / items_total) ELSE 1 END AS non_vat_part,
      1 AS bills
    FROM per_bill
    UNION ALL
    SELECT
      m,
      -refund_amount * CASE WHEN items_total > 0 THEN vat_items / items_total ELSE 0 END,
      -refund_amount * CASE WHEN items_total > 0 THEN 1 - (vat_items / items_total) ELSE 1 END,
      0
    FROM per_return
  )
  SELECT
    m AS month,
    COALESCE(SUM(vat_part), 0) AS vat_sales,
    COALESCE(SUM(non_vat_part), 0) AS non_vat_sales,
    SUM(bills)::bigint AS bill_count
  FROM legs
  GROUP BY m
  ORDER BY m;
$$;

GRANT EXECUTE ON FUNCTION public.vat_sales_by_month(int) TO authenticated;
