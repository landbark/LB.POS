import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { expireStaleOrders } from '@/lib/order-stock'
import type { Order } from '@/lib/types'
import OrdersClient from './OrdersClient'

export default async function AdminOrdersPage() {
  // ออเดอร์ที่ลูกค้าไม่โอนเกินกำหนด ปิดทิ้งก่อนแสดงผล จะได้ไม่ค้างในคิว
  await expireStaleOrders()

  const supabase = await createClient()
  const [{ data: { user } }, { data }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('orders')
      .select('*, customers(id, name, phone), order_items(*)')
      .order('created_at', { ascending: false })
      .limit(300),
  ])

  const orders = (data ?? []) as unknown as Order[]

  // ลิงก์สลิปแบบชั่วคราว ทำทีเดียวทั้งหน้า เพื่อกดดูได้จากตารางเลย
  const paths = orders.map((o) => o.payment_slip_path).filter((p): p is string => Boolean(p))
  const slipUrls: Record<string, string> = {}
  if (paths.length > 0) {
    const { data: signed } = await createAdminClient()
      .storage.from('payment-slips')
      .createSignedUrls(paths, 60 * 30)
    for (const item of signed ?? []) {
      const order = orders.find((o) => o.payment_slip_path === item.path)
      if (order && item.signedUrl) slipUrls[order.id] = item.signedUrl
    }
  }

  return <OrdersClient orders={orders} slipUrls={slipUrls} userId={user?.id ?? ''} />
}
