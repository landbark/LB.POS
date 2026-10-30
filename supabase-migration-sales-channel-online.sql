-- LANDBARK POS — Migration: แยกช่องทาง "เว็บร้าน" ออกจากหน้าร้าน (2026-10-30)
--
-- เดิมบิลที่สร้างตอนยืนยันออเดอร์เว็บ (orders.transaction_id) ไม่ได้ใส่ sales_channel
-- จึงตกไปเป็นค่า default 'store' = ไปรวมกับยอดขายหน้าร้าน แยกไม่ออกในหน้าสรุป
--
-- เพิ่มค่า 'online' แล้วไล่แก้บิลเก่าให้ตรง — หน้าสรุปจัดกลุ่มเป็น หน้าร้าน / ออกบูธ / ออนไลน์
-- (ออนไลน์ = เว็บร้าน + Shopee + TikTok + Lazada)
--
-- เว็บร้านยังนับเป็น "เงินที่ร้านรับเอง" เหมือนหน้าร้าน/บูธ — ลูกค้าโอนเข้าบัญชีร้านตรงๆ
-- ไม่โดนหักค่าธรรมเนียมแบบ marketplace ยอดจึงเข้าสรุปรายวันและรายงาน VAT ตามปกติ
--
-- รันใน Supabase SQL Editor ก่อน deploy เสมอ (รันซ้ำได้ ไม่พังของเดิม)

-- ───────────────────────────────────────────────────────────────
-- 1) เปิดรับค่า 'online'
-- ───────────────────────────────────────────────────────────────
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_sales_channel_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_sales_channel_check
  CHECK (sales_channel IN ('store', 'shopee', 'tiktok', 'lazada', 'booth', 'online'));

COMMENT ON COLUMN transactions.sales_channel IS
  'ช่องทางขาย — store = หน้าร้าน, booth = งานออกบูธ, online = เว็บร้านของเราเอง, ที่เหลือคือ marketplace';

-- ───────────────────────────────────────────────────────────────
-- 2) บิลเก่าของออเดอร์เว็บ → 'online' + ติดเลขที่ออเดอร์ไว้ตามกลับ
-- ───────────────────────────────────────────────────────────────
UPDATE transactions t
SET sales_channel = 'online',
    external_order_no = COALESCE(t.external_order_no, o.order_number)
FROM orders o
WHERE o.transaction_id = t.id
  AND t.sales_channel = 'store';

-- ───────────────────────────────────────────────────────────────
-- 3) รายงาน VAT — นับทุกช่องทางที่ร้านรับเงินเอง (รวมเว็บร้านที่เพิ่งแยกออกมา)
--    เลิก whitelist รายช่องทาง เปลี่ยนเป็นตัดเฉพาะ marketplace ออก
--    เพิ่มช่องทางใหม่ทีหลังจะไม่หายจากรายงานแบบเงียบๆ อีก
-- ───────────────────────────────────────────────────────────────
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
      AND t.sales_channel NOT IN ('shopee', 'tiktok', 'lazada')
      AND EXTRACT(YEAR FROM t.created_at AT TIME ZONE 'Asia/Bangkok') = p_year
    GROUP BY t.id, t.total, m
  )
  SELECT
    m AS month,
    COALESCE(SUM(total * CASE WHEN items_total > 0 THEN vat_items / items_total ELSE 0 END), 0) AS vat_sales,
    COALESCE(SUM(total * CASE WHEN items_total > 0 THEN 1 - (vat_items / items_total) ELSE 1 END), 0) AS non_vat_sales,
    COUNT(*) AS bill_count
  FROM per_bill
  GROUP BY m
  ORDER BY m;
$$;

GRANT EXECUTE ON FUNCTION public.vat_sales_by_month(int) TO authenticated;
