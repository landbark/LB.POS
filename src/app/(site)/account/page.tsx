import Link from 'next/link'
import { Gift, LogIn, LogOut, Package, Sparkles, Wallet } from 'lucide-react'
import { getSessionCustomer } from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CustomerAddress } from '@/lib/types'
import AddressBook from './AddressBook'
import MemberQr from './MemberQr'
import TelegramConnect from './TelegramConnect'

export const dynamic = 'force-dynamic'

// การ์ดสรุปบนมือถือแคบ — ตัดสตางค์ออกกันตัวเลขล้นกรอบ
const compact = (n: number) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 0 })

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

  // จับจองบัญชีสมาชิกเดิมไว้ แต่ร้านยังไม่ยืนยันว่าเป็นเจ้าของตัวจริง
  //
  // เบอร์โทรพิสูจน์ตัวตนไม่ได้ จึงยังไม่ให้เห็นอะไรที่เป็นของเจ้าของบัญชีเลย —
  // แม้แต่ "ชื่อ" ก็ไม่บอก (ไม่งั้นกรอกเบอร์มั่วแล้วรู้ว่าเบอร์นี้ชื่ออะไร)
  // สั่งของได้ตามปกติ ออเดอร์ที่สั่งเองดูได้ที่ /orders
  if (!customer.verified) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="rounded-xl bg-white border border-brand-muted/30 p-6">
          <h1 className="text-lg font-bold text-brand-dark">รอร้านยืนยันบัญชีสมาชิก</h1>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            เบอร์ <span className="font-medium">{customer.phone}</span> เป็นสมาชิกของร้านอยู่แล้ว
            เพื่อความปลอดภัยของเจ้าของบัญชี ทางร้านต้องยืนยันตัวตนก่อน
            จึงจะแสดงแต้มสะสม เครดิตร้าน ประวัติการซื้อ และบัตรสมาชิกให้
          </p>
          <p className="mt-3 rounded-lg bg-brand-cream/60 border border-brand-muted/30 px-3 py-2.5 text-sm text-brand-dark">
            แจ้งพนักงานที่ร้านได้เลย หรือรอทางร้านติดต่อกลับตามเบอร์ที่ให้ไว้ —
            ระหว่างนี้สั่งของออนไลน์ได้ตามปกติ
          </p>
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
      </div>
    )
  }

  const admin = createAdminClient()
  const [{ data: addresses }, { data: telegram }, { data: rewards }, { data: pointsConfig }] = await Promise.all([
    admin
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customer.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false }),
    // select('*') กันพังช่วงก่อนรัน migration (คอลัมน์ telegram_* อาจยังไม่มี)
    admin.from('customers').select('*').eq('id', customer.id).maybeSingle(),
    // ของแลกแต้ม — หน้านี้โชว์ให้ดูว่าแต้มที่มีแลกอะไรได้ ยังไม่ให้กดแลกออนไลน์
    // (กดแลกบนเว็บต้องมีระบบจองสต็อก/คูปอง และของที่จองไว้อาจหมดอายุคาร้าน)
    admin
      .from('rewards')
      .select('id, points_cost, note, products(name, price, active, product_lots(quantity))')
      .eq('active', true)
      .order('points_cost'),
    admin.from('points_config').select('enabled').limit(1).maybeSingle(),
  ])

  const tg = telegram as Record<string, unknown> | null

  // ของแลกที่โชว์ให้ลูกค้าเห็น — สินค้าต้องยังเปิดขายและมีของเหลือ
  // (ของหมดแล้วยังโชว์ จะกลายเป็นลูกค้าเก็บแต้มมารอแลกของที่ไม่มี)
  type RewardRow = {
    id: string
    points_cost: number
    note: string | null
    products: { name: string; price: number; active: boolean; product_lots: { quantity: number }[] } | null
  }
  const rewardList = ((rewards ?? []) as unknown as RewardRow[])
    .filter((r) => r.products?.active && (r.products.product_lots ?? []).reduce((n, l) => n + l.quantity, 0) > 0)
    .map((r) => ({
      id: r.id,
      points_cost: r.points_cost,
      note: r.note,
      name: r.products!.name,
      price: r.products!.price,
    }))

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="rounded-xl bg-brand-bg text-brand-cream p-5">
        <h1 className="text-xl font-bold">{customer.name}</h1>
        <p className="text-sm text-brand-muted mt-0.5">{customer.phone}</p>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-brand-bg-light px-1 py-3 min-w-0">
            <Sparkles size={16} className="mx-auto text-brand-muted" />
            <p className="mt-1 text-base sm:text-lg font-bold">{customer.points}</p>
            <p className="text-[11px] text-brand-muted">แต้มสะสม</p>
          </div>
          <div className="rounded-lg bg-brand-bg-light px-1 py-3 min-w-0">
            <Wallet size={16} className="mx-auto text-brand-muted" />
            <p className="mt-1 text-base sm:text-lg font-bold">฿{compact(customer.credit_balance)}</p>
            <p className="text-[11px] text-brand-muted">เครดิตร้าน</p>
          </div>
          <div className="rounded-lg bg-brand-bg-light px-1 py-3 min-w-0">
            <Package size={16} className="mx-auto text-brand-muted" />
            <p className="mt-1 text-base sm:text-lg font-bold">฿{compact(customer.total_spent)}</p>
            <p className="text-[11px] text-brand-muted">ยอดซื้อสะสม</p>
          </div>
        </div>
      </div>

      <MemberQr customerId={customer.id} name={customer.name} phone={customer.phone} />

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

      {pointsConfig?.enabled !== false && rewardList.length > 0 && (
        <div className="rounded-xl bg-white border border-brand-muted/30 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-brand-dark">
            <Gift size={18} className="text-brand-brown" /> แต้มของคุณแลกอะไรได้
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            แลกได้ที่หน้าร้าน — แจ้งพนักงานว่าขอแลกของชิ้นไหน ของมีจำนวนจำกัด หมดแล้วหมดเลย
          </p>
          <div className="mt-4 divide-y divide-brand-muted/20">
            {rewardList.map((r) => {
              const enough = customer.points >= r.points_cost
              return (
                <div key={r.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${enough ? 'text-brand-dark' : 'text-gray-400'}`}>
                      {r.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      มูลค่า ฿{compact(r.price)}
                      {r.note ? ` · ${r.note}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${enough ? 'text-brand-brown' : 'text-gray-400'}`}>
                      {r.points_cost} แต้ม
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {enough ? 'แลกได้เลย' : `ขออีก ${r.points_cost - customer.points} แต้ม`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <TelegramConnect
        linked={Boolean(tg?.telegram_chat_id)}
        notifyEnabled={tg?.telegram_notify !== false}
        botConfigured={Boolean(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)}
      />

      <AddressBook initialAddresses={(addresses ?? []) as CustomerAddress[]} />
    </div>
  )
}
