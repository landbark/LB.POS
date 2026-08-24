import Link from 'next/link'
import { LogIn, LogOut, Package, Sparkles, Wallet } from 'lucide-react'
import { getSessionCustomer } from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CustomerAddress } from '@/lib/types'
import AddressBook from './AddressBook'

export const dynamic = 'force-dynamic'

const money = (n: number) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ERROR_MESSAGES: Record<string, string> = {
  'line-not-configured': 'ร้านยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย LINE',
  'line-state': 'เซสชันหมดอายุ กรุณาลองเข้าสู่ระบบใหม่',
  'line-token': 'เชื่อมต่อกับ LINE ไม่สำเร็จ กรุณาลองใหม่',
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [{ error }, customer] = await Promise.all([searchParams, getSessionCustomer()])

  if (!customer) {
    return (
      <div className="max-w-lg mx-auto rounded-xl bg-white border border-brand-muted/30 p-8 text-center">
        <h1 className="text-lg font-bold text-brand-dark">เข้าสู่ระบบสมาชิก</h1>
        <p className="mt-2 text-sm text-gray-500">
          เข้าสู่ระบบด้วย LINE เพื่อดูแต้มสะสม ประวัติการซื้อ และสั่งซื้อสินค้าออนไลน์
        </p>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {ERROR_MESSAGES[error] ?? 'เข้าสู่ระบบไม่สำเร็จ'}
          </p>
        )}
        <Link
          href="/api/shop/login?next=/account"
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
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="rounded-xl bg-brand-bg text-brand-cream p-5">
        <h1 className="text-xl font-bold">{customer.name}</h1>
        <p className="text-sm text-brand-muted mt-0.5">{customer.phone}</p>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-brand-bg-light py-3">
            <Sparkles size={16} className="mx-auto text-brand-muted" />
            <p className="mt-1 text-lg font-bold">{customer.points}</p>
            <p className="text-[11px] text-brand-muted">แต้มสะสม</p>
          </div>
          <div className="rounded-lg bg-brand-bg-light py-3">
            <Wallet size={16} className="mx-auto text-brand-muted" />
            <p className="mt-1 text-lg font-bold">฿{money(customer.credit_balance)}</p>
            <p className="text-[11px] text-brand-muted">เครดิตร้าน</p>
          </div>
          <div className="rounded-lg bg-brand-bg-light py-3">
            <Package size={16} className="mx-auto text-brand-muted" />
            <p className="mt-1 text-lg font-bold">฿{money(customer.total_spent)}</p>
            <p className="text-[11px] text-brand-muted">ยอดซื้อสะสม</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href="/orders"
          className="flex-1 text-center py-3 rounded-xl bg-white border border-brand-muted/30 text-sm font-medium text-brand-dark hover:border-brand-brown"
        >
          ออเดอร์ของฉัน
        </Link>
        <form action="/api/shop/logout" method="post" className="flex-1">
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-brand-muted/30 text-sm text-gray-600 hover:border-red-300 hover:text-red-600"
          >
            <LogOut size={16} /> ออกจากระบบ
          </button>
        </form>
      </div>

      <AddressBook initialAddresses={(addresses ?? []) as CustomerAddress[]} />
    </div>
  )
}
