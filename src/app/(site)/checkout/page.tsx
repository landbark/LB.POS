import Link from 'next/link'
import { LogIn } from 'lucide-react'
import { getSessionCustomer } from '@/lib/customer-session'
import { getStorefront } from '@/lib/shop-data'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CustomerAddress } from '@/lib/types'
import CheckoutClient from './CheckoutClient'

export const dynamic = 'force-dynamic'

export default async function CheckoutPage() {
  const [store, customer] = await Promise.all([getStorefront(), getSessionCustomer()])

  if (!store?.shop_enabled) {
    return (
      <div className="max-w-lg mx-auto rounded-xl bg-white border border-brand-muted/30 p-8 text-center">
        <p className="text-gray-500">ร้านค้าออนไลน์ปิดรับออเดอร์ชั่วคราว</p>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="max-w-lg mx-auto rounded-xl bg-white border border-brand-muted/30 p-8 text-center">
        <h1 className="text-lg font-bold text-brand-dark">เข้าสู่ระบบก่อนสั่งซื้อ</h1>
        <p className="mt-2 text-sm text-gray-500">
          เข้าสู่ระบบด้วย LINE เพื่อผูกกับบัญชีสมาชิกของร้าน — เก็บแต้มและติดตามออเดอร์ได้
        </p>
        <Link
          href="/api/shop/login?next=/checkout"
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#06C755] text-white font-medium hover:opacity-90"
        >
          <LogIn size={18} /> เข้าสู่ระบบด้วย LINE
        </Link>
      </div>
    )
  }

  const admin = createAdminClient()
  const { data: addresses } = await admin
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customer.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return (
    <CheckoutClient
      customerName={customer.name}
      customerPhone={customer.phone}
      addresses={(addresses ?? []) as CustomerAddress[]}
      pickupNote={store.pickup_note}
      storeAddress={store.address}
      freeShippingMin={store.free_shipping_min}
    />
  )
}
