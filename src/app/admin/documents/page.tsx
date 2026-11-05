import { createClient } from '@/lib/supabase/server'
import { isVet } from '@/lib/roles'
import { thaiDateIn, thaiDayRange } from '@/lib/thaiDate'
import { groupAdjustDocs, isStockCountReason, type AdjustRow } from '@/lib/stockMovements'
import DocumentsClient from './DocumentsClient'

/** ย้อนหลังกี่วันสำหรับใบตัดสต็อก — ของเก่ากว่านี้ดูได้ที่รายงานความเคลื่อนไหวสต็อค */
const ADJUST_DAYS = 90

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const adjustSince = thaiDayRange(thaiDateIn(-ADJUST_DAYS)).startISO

  // สัตวแพทย์พิเศษเปิดหน้านี้ได้แต่ดูอย่างเดียว — RLS ก็กันการเขียน transactions ไว้อีกชั้น
  const [{ data: profile }, { data: receipts }, { data: purchaseOrders }, { data: adjustments }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle(),
    supabase
      .from('transactions')
      .select('id, transaction_number, created_at, recorded_at, backdate_reason, total, status, customer_id, payment_method, payment_method_original, sales_channel, external_order_no, profiles!transactions_cashier_id_fkey(name), transaction_payments(method, amount)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('purchases')
      .select('id, purchase_number, created_at, total_cost, status, suppliers(name)')
      .order('created_at', { ascending: false })
      .limit(100),
    // การปรับสต็อกนอกบิล — ตัดออกจากหน้าขาย, ปรับเพิ่ม/ลดจากหน้าสินค้า, ลบล็อต
    // (ของจากการขายอยู่ในใบเสร็จแล้ว ของจากการนับสต็อกมีใบของตัวเองที่เมนูนับสต็อก)
    supabase
      .from('stock_movements')
      .select('id, created_at, type, quantity, reason, product_id, products!inner(name, sku, unit), profiles(name)')
      .in('type', ['adjust_in', 'adjust_out'])
      .gte('created_at', adjustSince)
      .order('created_at', { ascending: false })
      .limit(1000),
  ])

  // จับแถวที่มาจากการกดครั้งเดียวกันให้เป็นใบเดียว แล้วส่งเฉพาะที่ client ต้องใช้วาดตาราง
  const stockDocs = groupAdjustDocs(
    ((adjustments ?? []) as unknown as AdjustRow[]).filter((m) => !isStockCountReason(m.reason))
  ).map((d) => ({
    id: d.id,
    type: d.type,
    note: d.note,
    createdAt: d.createdAt,
    byName: d.byName,
    totalQty: d.totalQty,
    itemCount: d.rows.length,
    preview: d.rows
      .slice(0, 2)
      .map((r) => r.products?.name ?? '—')
      .join(', '),
  }))

  return (
    <DocumentsClient
      receipts={(receipts as never[]) ?? []}
      purchaseOrders={(purchaseOrders as never[]) ?? []}
      stockDocs={stockDocs}
      currentUserId={user?.id ?? ''}
      canEdit={!isVet(profile?.role)}
      initialTab={tab === 'stock' || tab === 'purchase' ? tab : 'receipt'}
    />
  )
}
