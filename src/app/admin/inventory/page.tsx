import { createClient } from '@/lib/supabase/server'
import { AlertTriangle } from 'lucide-react'

export default async function InventoryPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: lots } = await supabase
    .from('product_lots')
    .select('*, products(name, sku, unit, min_stock, active)')
    .gt('quantity', 0)
    .order('expiry_date', { ascending: true, nullsFirst: false })

  const activeLots = lots?.filter((l) => (l.products as any)?.active) ?? []

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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">สต็อคสินค้า</h1>

      {(expiredLots.length > 0 || expiringSoon.length > 0) && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 flex gap-3">
          <AlertTriangle size={20} className="text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">
              พบสินค้าที่ต้องดูแล
            </p>
            <p className="text-sm text-orange-700 mt-0.5">
              {expiredLots.length > 0 && `หมดอายุแล้ว ${expiredLots.length} lot · `}
              {expiringSoon.length > 0 && `ใกล้หมดอายุ (30 วัน) ${expiringSoon.length} lot`}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                  ยังไม่มีสต็อค
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
