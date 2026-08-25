import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Order } from '@/lib/types'
import OrderDetail from './OrderDetail'

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('orders')
    .select('*, customers(id, name, phone), order_items(*, products(sku))')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const order = data as unknown as Order

  // สลิปอยู่ในบัคเก็ตส่วนตัว — ต้องออก URL ชั่วคราวด้วย service role
  let slipUrl: string | null = null
  if (order.payment_slip_path) {
    const { data: signed } = await createAdminClient()
      .storage.from('payment-slips')
      .createSignedUrl(order.payment_slip_path, 60 * 30)
    slipUrl = signed?.signedUrl ?? null
  }

  return <OrderDetail order={order} slipUrl={slipUrl} userId={user.id} />
}
