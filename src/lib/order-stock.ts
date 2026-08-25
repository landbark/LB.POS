import { createAdminClient } from '@/lib/supabase/admin'
import { ORDER_EXPIRY_HOURS } from '@/lib/shop'

// ของที่ "จองไว้" กับออเดอร์ที่ยังไม่ได้ตัดสต็อค (รอโอน / รอร้านตรวจสลิป)
// เอาไปหักออกจากยอดที่โชว์บนเว็บ ลูกค้าอีกคนจะได้ไม่สั่งชิ้นเดียวกันซ้ำ
// (สต็อคจริงไม่ถูกล็อก — หน้าร้านยังขายได้ตามปกติ)
const HOLDING_STATUSES = ['pending_payment', 'awaiting_confirm']

export async function getReservedQuantities(): Promise<Map<string, number>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('order_items')
    .select('product_id, quantity, orders!inner(status)')
    .in('orders.status', HOLDING_STATUSES)
    .limit(5000)

  const reserved = new Map<string, number>()
  for (const row of (data ?? []) as unknown as { product_id: string | null; quantity: number }[]) {
    if (!row.product_id) continue
    reserved.set(row.product_id, (reserved.get(row.product_id) ?? 0) + row.quantity)
  }
  return reserved
}

/**
 * ยกเลิกออเดอร์ที่ลูกค้าสั่งค้างไว้แล้วไม่โอนเกินกำหนด
 * เรียกตอน: ลูกค้าสั่งของใหม่, พนักงานเปิดหน้าออเดอร์, และ cron ตอนเช้า
 */
export async function expireStaleOrders(hours = ORDER_EXPIRY_HOURS): Promise<number> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const { data } = await admin
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: `ไม่ได้ชำระเงินภายใน ${hours} ชั่วโมง (ยกเลิกอัตโนมัติ)`,
    })
    .eq('status', 'pending_payment')
    .lt('created_at', cutoff)
    .select('id')

  return data?.length ?? 0
}
