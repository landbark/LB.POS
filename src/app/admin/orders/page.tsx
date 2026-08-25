import { createClient } from '@/lib/supabase/server'
import { expireStaleOrders } from '@/lib/order-stock'
import type { Order } from '@/lib/types'
import OrdersClient from './OrdersClient'

export default async function AdminOrdersPage() {
  // ออเดอร์ที่ลูกค้าไม่โอนเกินกำหนด ปิดทิ้งก่อนแสดงผล จะได้ไม่ค้างในคิว
  await expireStaleOrders()

  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select('*, customers(id, name, phone), order_items(id, product_name, quantity)')
    .order('created_at', { ascending: false })
    .limit(300)

  return <OrdersClient orders={(data ?? []) as unknown as Order[]} />
}
