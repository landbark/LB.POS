import Link from '@/components/ProgressLink'
import { ArrowLeft, FileText, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { thaiDayRange, thaiMonthStart, thaiToday } from '@/lib/thaiDate'
import { toOne } from '@/lib/supabase/embed'
import type { StockMovementType } from '@/lib/types'
import { IN_TYPES, MOVEMENT_LABEL, OUT_TYPES } from '@/lib/stockMovements'
import RangeFilters from './RangeFilters'

/** แสดงสินค้าที่เคลื่อนไหวมากสุดเท่านี้แถว — ทั้งร้านมีหลายร้อยตัว ตารางยาวเกินกว่าจะอ่าน */
const TOP_ROWS = 60

interface MoveRow {
  type: StockMovementType
  quantity: number
  product_id: string
  products: { name: string; unit: string } | { name: string; unit: string }[] | null
}

/** ยอดของสินค้าหนึ่งตัวในช่วงที่เลือก แยกตามประเภทการเคลื่อนไหว */
interface ProductTotals {
  productId: string
  name: string
  unit: string
  byType: Record<StockMovementType, number>
  inQty: number
  outQty: number
  onHand: number
}

const ORDER: StockMovementType[] = ['receive', 'adjust_in', 'cancel', 'sale', 'adjust_out']

export default async function StockMovementReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()

  // ตั้งต้นเป็นเดือนนี้ — เท่ากับช่วงที่การ์ดยอดขายในหน้ารายงานใช้ ดูคู่กันได้
  const from = sp.from || thaiMonthStart()
  const to = sp.to || thaiToday()
  const start = thaiDayRange(from).startISO
  const end = thaiDayRange(to).endISO

  // ขายวันละหลายสิบแถว ทั้งเดือนเกิน 1000 แน่ — ต้องไล่ดึงทีละหน้า ไม่งั้นยอดขาดแบบไม่มี error
  // products!inner ตัดแถวของสินค้าที่ถูกลบไปแล้วออก (ชื่อไม่เหลือให้แสดง)
  const [moves, lots] = await Promise.all([
    fetchAll<MoveRow>((f, t) =>
      supabase
        .from('stock_movements')
        .select('type, quantity, product_id, products!inner(name, unit)')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('id')
        .range(f, t)
    ),
    fetchAll<{ product_id: string; quantity: number }>((f, t) =>
      supabase.from('product_lots').select('product_id, quantity').order('id').range(f, t)
    ),
  ])

  const onHand = new Map<string, number>()
  for (const l of lots) onHand.set(l.product_id, (onHand.get(l.product_id) ?? 0) + l.quantity)

  const byProduct = new Map<string, ProductTotals>()
  const grand: Record<StockMovementType, number> = { sale: 0, receive: 0, adjust_in: 0, adjust_out: 0, cancel: 0 }

  for (const m of moves) {
    const product = toOne<{ name: string; unit: string }>(m.products)
    let row = byProduct.get(m.product_id)
    if (!row) {
      row = {
        productId: m.product_id,
        name: product?.name ?? '—',
        unit: product?.unit ?? '',
        byType: { sale: 0, receive: 0, adjust_in: 0, adjust_out: 0, cancel: 0 },
        inQty: 0,
        outQty: 0,
        onHand: onHand.get(m.product_id) ?? 0,
      }
      byProduct.set(m.product_id, row)
    }
    row.byType[m.type] += m.quantity
    grand[m.type] += m.quantity
    if (IN_TYPES.includes(m.type)) row.inQty += m.quantity
    if (OUT_TYPES.includes(m.type)) row.outQty += m.quantity
  }

  // เรียงตามของที่ขยับมากสุด (เข้า+ออก) — ตัวที่ต้องจับตามักอยู่หัวตาราง
  const rows = [...byProduct.values()].sort((a, b) => b.inQty + b.outQty - (a.inQty + a.outQty))
  const shown = rows.slice(0, TOP_ROWS)

  const totalIn = IN_TYPES.reduce((s, t) => s + grand[t], 0)
  const totalOut = OUT_TYPES.reduce((s, t) => s + grand[t], 0)

  const qs = `from=${from}&to=${to}`
  const num = (n: number) => n.toLocaleString('th-TH')

  return (
    <div>
      <Link href="/admin/reports" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
        <ArrowLeft size={15} /> กลับไปหน้ารายงาน
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ความเคลื่อนไหวสต็อค</h1>
      <p className="text-sm text-gray-500 mb-4">
        ของเข้า-ออกจากชั้นในช่วงที่เลือก รวมที่ตัดออกตอนขายหน้าร้าน · นับตามหน่วยฐานของสินค้า
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <RangeFilters from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-500">ของเข้าทั้งหมด</p>
          <p className="text-xl font-bold text-green-600">+{num(totalIn)}</p>
          <p className="text-xs text-gray-400 mt-0.5">รับเข้า · ปรับเพิ่ม · คืนบิล</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-500">ของออกทั้งหมด</p>
          <p className="text-xl font-bold text-red-500">-{num(totalOut)}</p>
          <p className="text-xs text-gray-400 mt-0.5">ขาย · ปรับลด/ตัดออก</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-500">ตัดออกจากการขาย</p>
          <p className="text-xl font-bold text-gray-900">-{num(grand.sale)}</p>
          <p className="text-xs text-gray-400 mt-0.5">ทุกช่องทาง รวมออกบูธ/ออนไลน์</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-500">สุทธิ</p>
          <p className={`text-xl font-bold ${totalIn - totalOut >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {totalIn - totalOut >= 0 ? '+' : ''}{num(totalIn - totalOut)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{num(rows.length)} สินค้าที่ขยับ</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">แยกตามประเภท</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {ORDER.map((t) => {
            const cfg = MOVEMENT_LABEL[t]
            return (
              <div key={t}>
                <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>{cfg.text}</span>
                <p className={`text-lg font-semibold mt-1 ${cfg.sign === '+' ? 'text-green-600' : 'text-red-500'}`}>
                  {cfg.sign}{num(grand[t])}
                </p>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-gray-100 text-sm">
          <Link href={`/admin/inventory/history?${qs}&type=all`} className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium">
            <History size={15} /> ดูทุกบรรทัดในประวัติสต็อค
          </Link>
          <Link href="/admin/documents?tab=stock" className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium">
            <FileText size={15} /> ใบตัดสต็อก/ปรับสต็อก
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <div className="px-4 py-3 border-b border-gray-100 flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-gray-900">แยกตามสินค้า</h2>
          <p className="text-xs text-gray-400">
            {rows.length > TOP_ROWS
              ? `แสดง ${TOP_ROWS} ตัวที่ขยับมากสุด จาก ${num(rows.length)} ตัว`
              : `${num(rows.length)} ตัว`}
          </p>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สินค้า</th>
              {ORDER.map((t) => (
                <th key={t} className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3 whitespace-nowrap">
                  {MOVEMENT_LABEL[t].text}
                </th>
              ))}
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-3">สุทธิ</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">คงเหลือ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {shown.length === 0 && (
              <tr>
                <td colSpan={ORDER.length + 3} className="px-4 py-10 text-center text-sm text-gray-400">
                  ไม่มีการเคลื่อนไหวในช่วงที่เลือก
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const net = r.inQty - r.outQty
              return (
                <tr key={r.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/admin/products/${r.productId}`} className="text-gray-900 hover:text-blue-600">
                      {r.name}
                    </Link>
                    {r.unit && <span className="text-xs text-gray-400 ml-1">({r.unit})</span>}
                  </td>
                  {ORDER.map((t) => (
                    <td key={t} className="px-3 py-3 text-sm text-right tabular-nums text-gray-600">
                      {r.byType[t] ? `${MOVEMENT_LABEL[t].sign}${num(r.byType[t])}` : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className={`px-3 py-3 text-sm text-right tabular-nums font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {net >= 0 ? '+' : ''}{num(net)}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right tabular-nums font-semibold ${r.onHand < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {num(r.onHand)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {shown.length > 0 && (
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td className="px-4 py-3 text-sm font-semibold text-gray-700">รวมทั้งช่วง</td>
                {ORDER.map((t) => (
                  <td key={t} className="px-3 py-3 text-sm text-right tabular-nums font-semibold text-gray-700">
                    {grand[t] ? `${MOVEMENT_LABEL[t].sign}${num(grand[t])}` : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className={`px-3 py-3 text-sm text-right tabular-nums font-bold ${totalIn - totalOut >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {totalIn - totalOut >= 0 ? '+' : ''}{num(totalIn - totalOut)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        ยอดนับเป็นหน่วยฐานของสินค้า (ขาย 2 กล่อง = 24 ซอง จะขึ้นเป็น 24) · คงเหลือคือยอดในทุกล็อตตอนนี้
        ไม่ใช่ยอดปลายช่วง · คงเหลือติดลบคือขายเกินยอดในระบบ ต้องไปนับสต็อกใหม่
      </p>
    </div>
  )
}
