import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { thaiToday, thaiDateIn, thaiDayRange } from '@/lib/thaiDate'
import { Package, ShoppingBag, AlertTriangle, TrendingUp, Clock, CalendarClock, Syringe } from 'lucide-react'
import { dueVaccinations, graceDaysFrom } from '@/lib/vaccines'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { toOne } from '@/lib/supabase/embed'
import { APPOINTMENT_TYPE_LABELS, type AppointmentType } from '@/lib/types'
import { CHANNEL_GROUP_COLOR, CHANNEL_LABEL, totalsByChannelGroup } from '@/lib/salesChannel'
import StaffRequests, { type StaffRequest } from '../settings/StaffRequests'

interface VaxRow {
  pet_id: string
  vaccine_name: string
  dose_date: string
  next_due_date: string | null
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const todayThai = thaiToday()
  const today = todayThai
  // ช่วง "วันนี้" ตามเวลาไทย → UTC ไว้ query คอลัมน์ timestamptz (created_at, scheduled_at)
  const { startISO: dayStartUtc, endISO: dayEndUtcISO } = thaiDayRange(todayThai)

  const [
    { data: me },
    { count: productCount },
    { data: todayTx },
    { data: lowStockLots },
    { data: expiringSoon },
    { count: waitingCount },
    { data: todayAppts },
    vaxRows,
    { data: openOrders },
    { data: notifySettings },
  ] = await Promise.all([
    // ยิงพร้อมกันทั้งหมด — เดิมรอ profile เสร็จก่อนค่อยเริ่มชุดนี้ เสียเวลาไป-กลับ DB ฟรีๆ หนึ่งรอบ
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle(),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('transactions').select('total, sales_channel')
      .neq('status', 'cancelled')
      .gte('created_at', dayStartUtc).lt('created_at', dayEndUtcISO),
    supabase.from('product_lots')
      .select('quantity, products(name)')
      .eq('products.active', true)
      .lt('quantity', 5)
      .gt('quantity', 0),
    supabase.from('product_lots')
      .select('expiry_date, quantity, products(name, unit)')
      .gte('expiry_date', today)
      .lte('expiry_date', thaiDateIn(30))
      .gt('quantity', 0),
    // คลินิก
    supabase.from('visits').select('*', { count: 'exact', head: true }).eq('status', 'waiting'),
    supabase
      .from('appointments')
      .select('id, scheduled_at, type, status, pets(name), customers(name)')
      .eq('status', 'scheduled')
      .gte('scheduled_at', dayStartUtc)
      .lt('scheduled_at', dayEndUtcISO)
      .order('scheduled_at'),
    // วัคซีนสะสมโตขึ้นเรื่อย ๆ — .limit() ไม่ช่วย เพราะเซิร์ฟเวอร์ตัดที่ 1000 แถวอยู่ดี
    fetchAll<VaxRow>((from, to) =>
      supabase
        .from('pet_vaccinations')
        .select('pet_id, vaccine_name, dose_date, next_due_date, pets!inner(active)')
        .eq('pets.active', true)
        .order('id')
        .range(from, to)
    ),
    // ออเดอร์ออนไลน์ที่ยังค้างอยู่
    supabase
      .from('orders')
      .select('status')
      .in('status', ['pending_payment', 'awaiting_confirm', 'confirmed']),
    // จำนวนวันที่ยอมให้เลยกำหนดก่อนเลิกเตือนวัคซีน — ตั้งไว้ที่หน้าแจ้งเตือน
    supabase.from('notify_settings').select('*').eq('id', 1).maybeSingle(),
  ])

  // คำขอเข้าใช้งานที่รอเจ้าของร้านอนุมัติ (คนที่ล็อกอิน Google เข้ามาเอง) — เฉพาะแอดมินถึงจะดึง
  const { data: staffRequests } = me?.role === 'admin'
    ? await supabase
        .from('profiles')
        .select('id, name, email, created_at')
        .eq('active', false)
        .is('rejected_at', null)
        .order('created_at', { ascending: false })
    : { data: [] }

  const orderCounts = {
    awaiting: (openOrders ?? []).filter((o) => o.status === 'awaiting_confirm').length,
    packing: (openOrders ?? []).filter((o) => o.status === 'confirmed').length,
    unpaid: (openOrders ?? []).filter((o) => o.status === 'pending_payment').length,
  }

  const vaxDue = dueVaccinations(vaxRows, todayThai, 30, graceDaysFrom(notifySettings))

  // แยกยอดวันนี้เป็น หน้าร้าน / ออกบูธ / ออนไลน์ — การ์ดใบแรกนับเฉพาะเงินที่ร้านรับเอง
  // (ยอด marketplace ไม่ใช่เงินที่ได้จริง โดนหักค่าธรรมเนียมก่อนโอนเข้าบัญชีเป็นรอบ)
  const byGroup = totalsByChannelGroup(todayTx ?? [])
  const todaySales = byGroup.reduce((sum, g) => sum + g.ownAmount, 0)
  const todayCount = byGroup.reduce((sum, g) => sum + g.ownCount, 0)
  const platformTotal = byGroup.reduce((sum, g) => sum + (g.amount - g.ownAmount), 0)
  const platformCount = byGroup.reduce((sum, g) => sum + (g.count - g.ownCount), 0)

  const stats = [
    {
      label: 'ยอดขายวันนี้',
      value: `฿${todaySales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      sub: `${todayCount} รายการ · ไม่รวมแพลตฟอร์ม`,
      icon: TrendingUp,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: 'สินค้าทั้งหมด',
      value: productCount?.toString() ?? '0',
      sub: 'SKU',
      icon: Package,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'สต็อคใกล้หมด',
      value: lowStockLots?.length?.toString() ?? '0',
      sub: 'รายการ',
      icon: AlertTriangle,
      color: 'text-orange-600 bg-orange-50',
    },
    {
      label: 'ใกล้หมดอายุ (30 วัน)',
      value: expiringSoon?.length?.toString() ?? '0',
      sub: 'lot',
      icon: ShoppingBag,
      color: 'text-red-600 bg-red-50',
    },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">ภาพรวม</h1>

      {(staffRequests ?? []).length > 0 && (
        <div className="mb-8">
          <StaffRequests requests={(staffRequests ?? []) as StaffRequest[]} />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className={`inline-flex p-2 rounded-lg ${stat.color} mb-3`}>
              <stat.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>
            <p className="text-sm text-gray-600 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ยอดขายวันนี้ แยกเป็นสามก้อน — เจ้าของร้านดูว่าวันนี้เงินมาจากทางไหน */}
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-700">ยอดขายวันนี้ แยกช่องทาง</h2>
        <Link href="/admin/daily" className="text-xs text-blue-600 hover:text-blue-700 font-medium">ดูสรุปรายวัน →</Link>
      </div>
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${platformCount > 0 ? 'mb-3' : 'mb-8'}`}>
        {byGroup.map((g) => (
          <div key={g.group} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_GROUP_COLOR[g.group].bg}`}>
                {g.label}
              </span>
              <span className="text-xs text-gray-400">{g.count} บิล</span>
            </div>
            <p className={`text-2xl font-bold ${g.amount > 0 ? CHANNEL_GROUP_COLOR[g.group].text : 'text-gray-300'}`}>
              ฿{g.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </p>
            {/* กลุ่มออนไลน์มีหลายช่องทาง กางให้เห็นว่ามาจากเว็บร้านหรือแพลตฟอร์มไหน */}
            {g.byChannel.length > 1 && (
              <div className="mt-2 space-y-0.5">
                {g.byChannel.map((c) => (
                  <div key={c.channel} className="flex justify-between text-xs text-gray-500">
                    <span>{CHANNEL_LABEL[c.channel]}</span>
                    <span className="tabular-nums">฿{c.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            )}
            {g.amount > g.ownAmount && (
              <p className="text-xs text-gray-400 mt-2">
                มียอดแพลตฟอร์ม ฿{(g.amount - g.ownAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} — ไม่รวมในยอดขายวันนี้
              </p>
            )}
          </div>
        ))}
      </div>
      {platformCount > 0 && (
        <p className="text-xs text-gray-400 mb-8">
          ยอดขายผ่านแพลตฟอร์มวันนี้ {platformCount} บิล (฿{platformTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })})
          ไม่นับเป็นเงินที่ร้านรับเอง — เงินจริงดูที่สรุปการเงินของแพลตฟอร์ม
        </p>
      )}

      {/* ร้านค้าออนไลน์ — โชว์เฉพาะตอนมีออเดอร์ค้าง */}
      {(orderCounts.awaiting + orderCounts.packing + orderCounts.unpaid) > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">ออเดอร์ออนไลน์</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Link href="/admin/orders" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-orange-200 transition-colors">
              <div className="inline-flex p-2 rounded-lg text-orange-600 bg-orange-50 mb-3"><ShoppingBag size={20} /></div>
              <p className="text-2xl font-bold text-gray-900">{orderCounts.awaiting}</p>
              <p className="text-sm text-gray-600 mt-1">รอตรวจสลิป</p>
            </Link>
            <Link href="/admin/orders" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
              <div className="inline-flex p-2 rounded-lg text-blue-600 bg-blue-50 mb-3"><Package size={20} /></div>
              <p className="text-2xl font-bold text-gray-900">{orderCounts.packing}</p>
              <p className="text-sm text-gray-600 mt-1">รอจัดของ/ส่ง</p>
            </Link>
            <Link href="/admin/orders" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-gray-200 transition-colors">
              <div className="inline-flex p-2 rounded-lg text-gray-500 bg-gray-100 mb-3"><Clock size={20} /></div>
              <p className="text-2xl font-bold text-gray-900">{orderCounts.unpaid}</p>
              <p className="text-sm text-gray-600 mt-1">รอลูกค้าโอน</p>
            </Link>
          </div>
        </>
      )}

      {/* คลินิก */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3">คลินิกวันนี้</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link href="/admin/visits" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-purple-200 transition-colors">
          <div className="inline-flex p-2 rounded-lg text-purple-600 bg-purple-50 mb-3"><Clock size={20} /></div>
          <p className="text-2xl font-bold text-gray-900">{waitingCount ?? 0}</p>
          <p className="text-sm text-gray-600 mt-1">คิวรอตรวจ</p>
        </Link>
        <Link href="/admin/appointments" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
          <div className="inline-flex p-2 rounded-lg text-blue-600 bg-blue-50 mb-3"><CalendarClock size={20} /></div>
          <p className="text-2xl font-bold text-gray-900">{todayAppts?.length ?? 0}</p>
          <p className="text-sm text-gray-600 mt-1">นัดวันนี้</p>
        </Link>
        <Link href="/admin/vaccines" className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-amber-200 transition-colors">
          <div className="inline-flex p-2 rounded-lg text-amber-600 bg-amber-50 mb-3"><Syringe size={20} /></div>
          <p className="text-2xl font-bold text-gray-900">{vaxDue.length}</p>
          <p className="text-sm text-gray-600 mt-1">วัคซีนครบกำหนด/เกิน</p>
        </Link>
      </div>

      {todayAppts && todayAppts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CalendarClock size={16} className="text-blue-500" /> นัดหมายวันนี้
          </h2>
          <div className="space-y-2">
            {todayAppts.map((a) => (
              <div key={a.id} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {new Date(a.scheduled_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })} · {(a.pets as unknown as { name: string } | null)?.name ?? '—'}
                  <span className="text-gray-400"> · {(a.customers as unknown as { name: string } | null)?.name ?? ''}</span>
                </span>
                <span className="text-gray-500">{APPOINTMENT_TYPE_LABELS[a.type as AppointmentType]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {expiringSoon && expiringSoon.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            สินค้าใกล้หมดอายุ (ภายใน 30 วัน)
          </h2>
          <div className="space-y-2">
            {expiringSoon.map((lot, i) => {
              const p = toOne<{ name: string; unit: string }>(lot.products)
              return (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {p?.name}
                    <span className="text-gray-400"> · เหลือ {lot.quantity} {p?.unit}</span>
                  </span>
                  <span className="text-red-600 font-medium">
                    หมดอายุ {new Date(lot.expiry_date!).toLocaleDateString('th-TH')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
