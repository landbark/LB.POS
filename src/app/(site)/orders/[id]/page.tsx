import { notFound, redirect } from 'next/navigation'
import { getSessionCustomer, orderCutoff } from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStorefront } from '@/lib/shop-data'
import type { Order } from '@/lib/types'
import OrderDetailClient from './OrderDetailClient'

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const customer = await getSessionCustomer()
  if (!customer) redirect(`/api/shop/login?next=/orders/${id}`)

  const admin = createAdminClient()
  let lookup = admin
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .eq('customer_id', customer.id)
  // บัญชีที่ยังรอร้านยืนยัน เปิดได้แค่ใบที่สั่งเอง ไม่ใช่ของเจ้าของบัญชีเดิม
  const cutoff = orderCutoff(customer)
  if (cutoff) lookup = lookup.gte('created_at', cutoff)

  const [{ data }, store] = await Promise.all([lookup.maybeSingle(), getStorefront()])

  if (!data) notFound()
  const order = data as Order

  // บัคเก็ตสลิปเป็นแบบส่วนตัว — ออก URL ชั่วคราวให้ดูเฉพาะเจ้าของออเดอร์
  let slipUrl: string | null = null
  if (order.payment_slip_path) {
    const { data: signed } = await admin.storage
      .from('payment-slips')
      .createSignedUrl(order.payment_slip_path, 60 * 10)
    slipUrl = signed?.signedUrl ?? null
  }

  return (
    <OrderDetailClient
      order={order}
      slipUrl={slipUrl}
      promptpayId={store?.promptpay_id ?? null}
      paymentQrUrl={store?.payment_qr_url ?? null}
      storeName={store?.name ?? 'LANDBARK'}
      pickupNote={store?.pickup_note ?? null}
    />
  )
}
