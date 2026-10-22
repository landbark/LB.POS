-- VAT รายเดือนไม่นับยอดขายผ่านแพลตฟอร์ม (2026-10-22)
--
-- Shopee/TikTok/Lazada หักค่าธรรมเนียม ค่าส่ง และส่วนลดของแพลตฟอร์มก่อนโอนเข้าบัญชีเป็นรอบ
-- ยอดที่ลงบิลใน POS จึงไม่ใช่เงินที่ร้านได้จริง — ตัวเลขการเงินของช่องทางพวกนี้ใช้สรุปของแพลตฟอร์มเอง
-- POS บันทึกบิลไว้เพื่อตัดสต็อกเท่านั้น รายงาน VAT จึงนับเฉพาะหน้าร้านกับงานออกบูธ
--
-- (ของเดิมที่เหลือเหมือนเดิม: เฉลี่ยส่วนลดท้ายบิล/แต้ม/เครดิตตามสัดส่วนราคาสินค้าในบิล, ตัดบิลที่ยกเลิก)
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
      AND t.sales_channel IN ('store', 'booth')
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
