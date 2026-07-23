import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Package, ShoppingBag, AlertTriangle, TrendingUp, Clock, CalendarClock, Syringe } from 'lucide-react'
import { dueVaccinations } from '@/lib/vaccines'
import { APPOINTMENT_TYPE_LABELS, type AppointmentType } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // ช่วง "วันนี้" ตามเวลาไทย → UTC ไว้ query scheduled_at (timestamptz)
  const todayThai = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const dayStartUtc = new Date(`${todayThai}T00:00:00+07:00`).toISOString()
  const dayEndUtc = new Date(`${todayThai}T00:00:00+07:00`)
  dayEndUtc.setUTCDate(dayEndUtc.getUTCDate() + 1)

  const [
    { count: productCount },
    { data: todayTx },
    { data: lowStockLots },
    { data: expiringSoon },
    { count: waitingCount },
    { data: todayAppts },
    { data: vaxRows },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('transactions').select('total').gte('created_at', today),
    supabase.from('product_lots')
      .select('quantity, products(name)')
      .eq('products.active', true)
      .lt('quantity', 5)
      .gt('quantity', 0),
    supabase.from('product_lots')
      .select('expiry_date, quantity, products(name, unit)')
      .gte('expiry_date', today)
      .lte('expiry_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .gt('quantity', 0),
    // คลินิก
    supabase.from('visits').select('*', { count: 'exact', head: true }).eq('status', 'waiting'),
    supabase
      .from('appointments')
      .select('id, scheduled_at, type, status, pets(name), customers(name)')
      .eq('status', 'scheduled')
      .gte('scheduled_at', dayStartUtc)
      .lt('scheduled_at', dayEndUtc.toISOString())
      .order('scheduled_at'),
    supabase
      .from('pet_vaccinations')
      .select('pet_id, vaccine_name, dose_date, next_due_date, pets!inner(active)')
      .eq('pets.active', true)
      .limit(5000),
  ])

  const vaxDue = dueVaccinations(
    ((vaxRows ?? []) as unknown as { pet_id: string; vaccine_name: string; dose_date: string; next_due_date: string | null }[]),
    todayThai,
    30,
  )

  const todaySales = todayTx?.reduce((sum, t) => sum + t.total, 0) ?? 0
  const todayCount = todayTx?.length ?? 0

  const stats = [
    {
      label: 'ยอดขายวันนี้',
      value: `฿${todaySales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      sub: `${todayCount} รายการ`,
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
                  {new Date(a.scheduled_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} · {(a.pets as unknown as { name: string } | null)?.name ?? '—'}
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
            {expiringSoon.map((lot, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {(lot.products as any)?.name}
                  <span className="text-gray-400"> · เหลือ {lot.quantity} {(lot.products as any)?.unit}</span>
                </span>
                <span className="text-red-600 font-medium">
                  หมดอายุ {new Date(lot.expiry_date!).toLocaleDateString('th-TH')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
