import Link from 'next/link'
import { LogIn, Package } from 'lucide-react'
import { getSessionCustomer } from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLE } from '@/lib/shop'
import { FULFILLMENT_LABELS, type Order } from '@/lib/types'

export const dynamic = 'force-dynamic'

const money = (n: number) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTh = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export default async function OrdersPage() {
  const customer = await getSessionCustomer()

  if (!customer) {
    return (
      <div className="max-w-lg mx-auto rounded-xl bg-white border border-brand-muted/30 p-8 text-center">
        <h1 className="text-lg font-bold text-brand-dark">ดูออเดอร์ของคุณ</h1>
        <p className="mt-2 text-sm text-gray-500">เข้าสู่ระบบด้วย LINE เพื่อดูประวัติการสั่งซื้อและแต้มสะสม</p>
        <Link
          href="/api/shop/login?next=/orders"
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#06C755] text-white font-medium hover:opacity-90"
        >
          <LogIn size={18} /> เข้าสู่ระบบด้วย LINE
        </Link>
      </div>
    )
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('orders')
    .select('*, order_items(id, product_name, quantity)')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })

  const orders = (data ?? []) as Order[]

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-brand-dark">ออเดอร์ของฉัน</h1>

      {orders.length === 0 ? (
        <div className="rounded-xl bg-white border border-brand-muted/30 p-10 text-center text-gray-500">
          <Package size={32} className="mx-auto mb-2 text-brand-muted" />
          <p className="text-sm">ยังไม่มีออเดอร์</p>
          <Link href="/shop" className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-brand-brown text-white text-sm font-medium">
            เลือกซื้อสินค้า
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block rounded-xl bg-white border border-brand-muted/30 p-4 hover:border-brand-brown transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-brand-dark">{order.order_number}</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_STYLE[order.status]}`}>
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {dateTh(order.created_at)} · {FULFILLMENT_LABELS[order.fulfillment]}
              </p>
              <p className="mt-2 text-sm text-gray-600 line-clamp-1">
                {(order.order_items ?? []).map((i) => `${i.product_name} × ${i.quantity}`).join(', ')}
              </p>
              <p className="mt-1 font-semibold text-brand-dark">฿{money(order.total)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
