import { createClient } from '@/lib/supabase/server'
import { AlertTriangle } from 'lucide-react'
import SearchBox from '@/components/SearchBox'

/** ล็อตสินค้าสะสมขึ้นทุกครั้งที่รับของ — แสดงทีละหน้า แล้วให้ค้นที่ server */
const PAGE_SIZE = 200

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()
  const term = (q ?? '').trim()
  const today = new Date().toISOString().split('T')[0]
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const columns = '*, products!inner(name, sku, unit, min_stock, active)'
  const baseQuery = () => supabase
    .from('product_lots')
    .select(columns)
    .gt('quantity', 0)
    .eq('products.active', true)
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .limit(PAGE_SIZE)

  let lots: Awaited<ReturnType<typeof baseQuery>>['data'] = []

  if (term) {
    const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    // .or() สองครั้งจะถูก AND เข้าด้วยกัน และเงื่อนไขบนตาราง join ผสมกับคอลัมน์ของตัวเองไม่ได้
    // จึงต้องยิงแยกแล้วรวมผลเอง
    const [byLot, byProduct] = await Promise.all([
      baseQuery().ilike('lot_number', like),
      baseQuery().or(`name.ilike.${like},sku.ilike.${like}`, { referencedTable: 'products' }),
    ])
    const seen = new Set<string>()
    lots = [...(byLot.data ?? []), ...(byProduct.data ?? [])]
      .filter((l) => !seen.has(l.id) && seen.add(l.id))
      .sort((a, b) => (a.expiry_date ?? '9999').localeCompare(b.expiry_date ?? '9999'))
      .slice(0, PAGE_SIZE)
  } else {
    lots = (await baseQuery()).data ?? []
  }

  // ตัวเลขในแถบเตือนต้องนับจากของทั้งหมด ไม่ใช่แค่หน้าที่แสดง
  const [{ count: expiredTotal }, { count: expiringTotal }] = await Promise.all([
    supabase.from('product_lots').select('id, products!inner(active)', { count: 'exact', head: true })
      .gt('quantity', 0).eq('products.active', true).lt('expiry_date', today),
    supabase.from('product_lots').select('id, products!inner(active)', { count: 'exact', head: true })
      .gt('quantity', 0).eq('products.active', true).gte('expiry_date', today).lte('expiry_date', in30Days),
  ])

  const activeLots = lots ?? []

  const expiredLots = activeLots.filter((l) => l.expiry_date && l.expiry_date < today)
  const expiringSoon = activeLots.filter(
    (l) => l.expiry_date && l.expiry_date >= today && l.expiry_date <= in30Days
  )
  const normal = activeLots.filter(
    (l) => !l.expiry_date || l.expiry_date > in30Days
  )

  function LotRow({ lot, highlight }: { lot: typeof activeLots[0]; highlight?: 'expired' | 'soon' }) {
    const p = lot.products as any
    return (
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{p?.name}</td>
        <td className="px-4 py-3 text-sm text-gray-500 font-mono">{p?.sku || '—'}</td>
        <td className="px-4 py-3 text-sm text-gray-500 font-mono">{lot.lot_number || '—'}</td>
        <td className="px-4 py-3 text-sm">
          {lot.expiry_date ? (
            <span className={highlight === 'expired' ? 'text-red-600 font-semibold' : highlight === 'soon' ? 'text-orange-500 font-medium' : 'text-gray-600'}>
              {new Date(lot.expiry_date).toLocaleDateString('th-TH')}
              {highlight === 'expired' && ' ❌'}
              {highlight === 'soon' && ' ⚠️'}
            </span>
          ) : (
            <span className="text-gray-400">ไม่ระบุ</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
          {lot.quantity} {p?.unit}
        </td>
      </tr>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">สต็อคสินค้า</h1>

      <SearchBox placeholder="ค้นหาสินค้า / SKU / เลขล็อต..." className="mb-4 max-w-xs" />

      {((expiredTotal ?? 0) > 0 || (expiringTotal ?? 0) > 0) && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 flex gap-3">
          <AlertTriangle size={20} className="text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">
              พบสินค้าที่ต้องดูแล
            </p>
            <p className="text-sm text-orange-700 mt-0.5">
              {(expiredTotal ?? 0) > 0 && `หมดอายุแล้ว ${expiredTotal} lot · `}
              {(expiringTotal ?? 0) > 0 && `ใกล้หมดอายุ (30 วัน) ${expiringTotal} lot`}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สินค้า</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">SKU</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Lot</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันหมดอายุ</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">คงเหลือ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {expiredLots.map((lot) => <LotRow key={lot.id} lot={lot} highlight="expired" />)}
            {expiringSoon.map((lot) => <LotRow key={lot.id} lot={lot} highlight="soon" />)}
            {normal.map((lot) => <LotRow key={lot.id} lot={lot} />)}
            {activeLots.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                  {term ? 'ไม่พบสินค้าที่ค้นหา' : 'ยังไม่มีสต็อค'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeLots.length === PAGE_SIZE && (
        <p className="text-xs text-gray-500 mt-3">
          แสดง {PAGE_SIZE} ล็อตแรก — พิมพ์ค้นหาเพื่อจำกัดผลลัพธ์
        </p>
      )}
    </div>
  )
}
