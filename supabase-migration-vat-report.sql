-- รายงานยอดขายกลุ่มที่อยู่ในบังคับ VAT รายเดือน (2026-07-22)
-- ใช้ดูว่ายอดทั้งปียังไม่ถึงเกณฑ์จดทะเบียน VAT (1.8 ล้านบาท/ปี) — ไว้ให้สรรพากรตรวจ
--
-- ทำเป็น function ใน DB เพราะถ้าดึง transaction_items ทั้งปีมารวมฝั่ง JS
-- จะชนลิมิตแถวของ PostgREST (1000 แถว) แล้วยอดจะขาดแบบเงียบๆ
--
-- ส่วนลดท้ายบิล/แต้ม/เครดิต หักที่ระดับบิล ไม่ได้แยกรายสินค้า
-- จึงเฉลี่ยยอดจริงที่เก็บได้ (transactions.total) ตามสัดส่วนราคาสินค้าในบิล
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
