import Link from '@/components/ProgressLink'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { thaiDateIn, thaiDayRange, thaiToday } from '@/lib/thaiDate'
import { ArrowLeft } from 'lucide-react'
import SearchBox from '@/components/SearchBox'
import type { StockMovementType } from '@/lib/types'
import HistoryFilters from './HistoryFilters'

const PAGE_SIZE = 100

const TYPE_LABEL: Record<StockMovementType, { text: string; className: string; sign: '+' | '-' }> = {
  sale: { text: 'ขาย', className: 'bg-gray-100 text-gray-600', sign: '-' },
  receive: { text: 'รับเข้า', className: 'bg-green-100 text-green-700', sign: '+' },
  adjust_in: { text: 'ปรับเพิ่ม', className: 'bg-blue-100 text-blue-700', sign: '+' },
  adjust_out: { text: 'ปรับลด', className: 'bg-orange-100 text-orange-700', sign: '-' },
  cancel: { text: 'คืนจากยกเลิก', className: 'bg-purple-100 text-purple-700', sign: '+' },
}

const ADJUST_TYPES = ['adjust_in', 'adjust_out']

interface Row {
  id: string
  created_at: string
  type: StockMovementType
  quantity: number
  reason: string | null
  product_id: string
  products: { name: string; unit: string } | null
  profiles: { name: string | null } | null
}

export default async function StockHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; type?: string; page?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()

  // ค่าตั้งต้น: 30 วันล่าสุด และโชว์เฉพาะการปรับสต็อก — รายการขายมีวันละหลายสิบ กลบของที่อยากตรวจ
  const to = sp.to || thaiToday()
  const from = sp.from || thaiDateIn(-29)
  const type = sp.type || 'adjust'
  const term = (sp.q ?? '').trim()
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const start = thaiDayRange(from).startISO
  const end = thaiDayRange(to).endISO

  const like = term ? `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null

  // products!inner เพื่อให้กรองด้วยชื่อสินค้าได้ (และตัดแถวของสินค้าที่ถูกลบไปแล้วออก)
  let list = supabase
    .from('stock_movements')
    .select('id, created_at, type, quantity, reason, product_id, products!inner(name, unit), profiles(name)', { count: 'exact' })
    .gte('created_at', start)
    .lt('created_at', end)
  if (type === 'adjust') list = list.in('type', ADJUST_TYPES)
  else if (type !== 'all') list = list.eq('type', type)
  if (like) list = list.ilike('products.name', like)

  // ยอดปรับเพิ่ม/ปรับลดต้องคิดจากทุกแถวในช่วงที่กรอง ไม่ใช่แค่หน้าที่เปิดอยู่
  // (เลือกดูเฉพาะ "ขาย" หรือ "รับเข้า" อยู่ ก็ไม่มีการปรับให้รวมตั้งแต่ต้น)
  const wantAdjustTotals = type === 'adjust' || type === 'all'

  const [{ data, count }, adjustRows] = await Promise.all([
    list.order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1),
    wantAdjustTotals
      ? fetchAll<{ type: StockMovementType; quantity: number }>((f, t) => {
          let q = supabase
            .from('stock_movements')
            .select('type, quantity, products!inner(name)')
            .gte('created_at', start)
            .lt('created_at', end)
            .in('type', ADJUST_TYPES)
          if (like) q = q.ilike('products.name', like)
          return q.order('id').range(f, t)
        })
      : Promise.resolve([]),
  ])

  const rows = (data ?? []) as unknown as Row[]
  const total = count ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const added = adjustRows.filter((r) => r.type === 'adjust_in').reduce((s, r) => s + r.quantity, 0)
  const removed = adjustRows.filter((r) => r.type === 'adjust_out').reduce((s, r) => s + r.quantity, 0)

  const pageLink = (p: number) => {
    const next = new URLSearchParams()
    if (term) next.set('q', term)
    if (sp.from) next.set('from', from)
    if (sp.to) next.set('to', to)
    if (sp.type) next.set('type', type)
    if (p > 1) next.set('page', String(p))
    const qs = next.toString()
    return `/admin/inventory/history${qs ? `?${qs}` : ''}`
  }

  return (
    <div>
      <Link href="/admin/inventory" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
        <ArrowLeft size={15} /> กลับไปหน้าสต็อค
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ประวัติสต็อค</h1>
      <p className="text-sm text-gray-500 mb-4">
        ทุกการเคลื่อนไหวของสต็อกทั้งร้านไว้ที่เดียว — ใครปรับอะไร เมื่อไหร่ ด้วยเหตุผลอะไร
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 space-y-3">
        <HistoryFilters from={from} to={to} type={type} />
        <SearchBox placeholder="ค้นชื่อสินค้า..." className="max-w-xs" />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'รายการที่พบ', value: total.toLocaleString('th-TH'), className: 'text-gray-900' },
          { label: 'ปรับเพิ่มรวม', value: `+${added.toLocaleString('th-TH')}`, className: 'text-green-600' },
          { label: 'ปรับลดรวม', value: `-${removed.toLocaleString('th-TH')}`, className: 'text-red-500' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-lg font-semibold ${s.className}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่/เวลา</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สินค้า</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ประเภท</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">จำนวน</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">โดย</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  ไม่มีรายการในช่วงที่เลือก
                </td>
              </tr>
            )}
            {rows.map((m) => {
              const cfg = TYPE_LABEL[m.type] ?? TYPE_LABEL.adjust_in
              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {new Date(m.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/admin/products/${m.product_id}`} className="text-gray-900 hover:text-blue-600">
                      {m.products?.name ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
                      {cfg.text}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-semibold whitespace-nowrap ${cfg.sign === '+' ? 'text-green-600' : 'text-red-500'}`}>
                    {cfg.sign}{m.quantity} {m.products?.unit}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{m.profiles?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{m.reason ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-gray-500">
            หน้า {page} จาก {lastPage} · ทั้งหมด {total.toLocaleString('th-TH')} รายการ
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageLink(page - 1)} className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg">
                ก่อนหน้า
              </Link>
            )}
            {page < lastPage && (
              <Link href={pageLink(page + 1)} className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg">
                ถัดไป
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
