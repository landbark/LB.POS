'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, PackagePlus } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Supplier } from '@/lib/types'

interface ProductOption {
  id: string
  name: string
  sku: string | null
  unit: string
  cost: number | null
  supplier_id: string | null
}

interface PurchaseRow {
  id: string
  purchase_number: string
  total_cost: number
  notes: string | null
  created_at: string
  suppliers: { name: string } | null
  purchase_items: { id: string }[]
}

interface ItemRow {
  product_id: string
  quantity: string
  unit_cost: string
  lot_number: string
  expiry_date: string
}

const emptyItem: ItemRow = { product_id: '', quantity: '', unit_cost: '', lot_number: '', expiry_date: '' }

interface Props {
  suppliers: Supplier[]
  products: ProductOption[]
  purchases: PurchaseRow[]
}

export default function ReceivingClient({ suppliers, products, purchases }: Props) {
  const router = useRouter()
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyItem }])
  const [loading, setLoading] = useState(false)

  // ถ้าเลือกซัพพลายเออร์ กรองสินค้าให้เห็นของเจ้านั้นก่อน (แต่ยังเลือกตัวอื่นได้)
  const sortedProducts = supplierId
    ? [...products].sort((a, b) => {
        const aMatch = a.supplier_id === supplierId ? 0 : 1
        const bMatch = b.supplier_id === supplierId ? 0 : 1
        return aMatch - bMatch || a.name.localeCompare(b.name, 'th')
      })
    : products

  function setItem(index: number, key: keyof ItemRow, value: string) {
    const next = [...items]
    next[index] = { ...next[index], [key]: value }
    // เลือกสินค้าแล้ว prefill ทุนจากราคาทุนสินค้า
    if (key === 'product_id') {
      const p = products.find((x) => x.id === value)
      if (p?.cost != null && !next[index].unit_cost) {
        next[index].unit_cost = p.cost.toString()
      }
    }
    setItems(next)
  }

  function addRow() {
    setItems([...items, { ...emptyItem }])
  }

  function removeRow(index: number) {
    if (items.length === 1) {
      setItems([{ ...emptyItem }])
      return
    }
    setItems(items.filter((_, i) => i !== index))
  }

  const validItems = items.filter((it) => it.product_id && parseInt(it.quantity) > 0)
  const totalCost = validItems.reduce(
    (sum, it) => sum + (parseFloat(it.unit_cost) || 0) * (parseInt(it.quantity) || 0),
    0
  )

  async function save() {
    if (validItems.length === 0) {
      toast.error('ใส่รายการสินค้าอย่างน้อย 1 รายการ')
      return
    }
    setLoading(true)
    const supabase = createClient()

    const { data: purchase, error: pErr } = await supabase
      .from('purchases')
      .insert({
        purchase_number: `PO${Date.now()}`,
        supplier_id: supplierId || null,
        total_cost: totalCost,
        notes: notes.trim() || null,
      })
      .select('id')
      .single()

    if (pErr || !purchase) {
      toast.error('บันทึกไม่สำเร็จ: ' + pErr?.message)
      setLoading(false)
      return
    }

    const { error: iErr } = await supabase.from('purchase_items').insert(
      validItems.map((it) => ({
        purchase_id: purchase.id,
        product_id: it.product_id,
        quantity: parseInt(it.quantity),
        unit_cost: parseFloat(it.unit_cost) || 0,
        lot_number: it.lot_number.trim() || null,
        expiry_date: it.expiry_date || null,
      }))
    )

    if (iErr) {
      toast.error('บันทึกรายการไม่สำเร็จ: ' + iErr.message)
      setLoading(false)
      return
    }

    // สต็อคเข้า — สร้าง lot ให้แต่ละรายการ
    const { error: lErr } = await supabase.from('product_lots').insert(
      validItems.map((it) => ({
        product_id: it.product_id,
        lot_number: it.lot_number.trim() || null,
        expiry_date: it.expiry_date || null,
        quantity: parseInt(it.quantity),
        initial_quantity: parseInt(it.quantity),
      }))
    )

    setLoading(false)
    if (lErr) {
      toast.error('บันทึกใบนำเข้าแล้ว แต่เพิ่มสต็อคไม่สำเร็จ: ' + lErr.message)
      return
    }

    toast.success(`นำเข้าสินค้า ${validItems.length} รายการแล้ว สต็อคเพิ่มเรียบร้อย`)
    setSupplierId('')
    setNotes('')
    setItems([{ ...emptyItem }])
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">นำเข้าสินค้า</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ซัพพลายเออร์</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
              <option value="">— ไม่ระบุ —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="เช่น เลขที่บิล / รอบส่ง" />
          </div>
        </div>

        {/* รายการสินค้า */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-medium text-gray-500 uppercase">
                <th className="text-left pb-2 pr-2 min-w-48">สินค้า</th>
                <th className="text-left pb-2 pr-2 w-20">จำนวน</th>
                <th className="text-left pb-2 pr-2 w-24">ทุน/หน่วย</th>
                <th className="text-left pb-2 pr-2 w-28">Lot</th>
                <th className="text-left pb-2 pr-2 w-36">วันหมดอายุ</th>
                <th className="text-right pb-2 w-24">รวม</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const rowTotal = (parseFloat(it.unit_cost) || 0) * (parseInt(it.quantity) || 0)
                return (
                  <tr key={i}>
                    <td className="pr-2 py-1.5">
                      <select value={it.product_id} onChange={(e) => setItem(i, 'product_id', e.target.value)} className={inputClass}>
                        <option value="">— เลือกสินค้า —</option>
                        {sortedProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku ? `[${p.sku}] ` : ''}{p.name}{supplierId && p.supplier_id === supplierId ? ' ★' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="pr-2 py-1.5">
                      <input type="number" min="1" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} className={inputClass} placeholder="0" />
                    </td>
                    <td className="pr-2 py-1.5">
                      <input type="number" min="0" step="0.01" value={it.unit_cost} onChange={(e) => setItem(i, 'unit_cost', e.target.value)} className={inputClass} placeholder="0.00" />
                    </td>
                    <td className="pr-2 py-1.5">
                      <input type="text" value={it.lot_number} onChange={(e) => setItem(i, 'lot_number', e.target.value)} className={inputClass} placeholder="LOT-001" />
                    </td>
                    <td className="pr-2 py-1.5">
                      <input type="date" value={it.expiry_date} onChange={(e) => setItem(i, 'expiry_date', e.target.value)} className={inputClass} />
                    </td>
                    <td className="py-1.5 text-sm text-right font-medium text-gray-900">
                      {rowTotal > 0 ? `฿${rowTotal.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => removeRow(i)} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium mt-2">
          <Plus size={14} /> เพิ่มรายการ
        </button>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            {validItems.length} รายการ · ทุนรวม <span className="font-bold text-gray-900">฿{totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
          </p>
          <button
            onClick={save}
            disabled={loading || validItems.length === 0}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            <PackagePlus size={16} />
            {loading ? 'กำลังบันทึก...' : 'บันทึกนำเข้า + เพิ่มสต็อค'}
          </button>
        </div>
      </div>

      {/* ประวัติการนำเข้า */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">ประวัติการนำเข้าล่าสุด</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เลขที่</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ซัพพลายเออร์</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">รายการ</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ทุนรวม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {purchases.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono text-gray-600">{p.purchase_number}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(p.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{p.suppliers?.name ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-right">{p.purchase_items?.length ?? 0}</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                  ฿{p.total_cost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            {purchases.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีประวัติการนำเข้า</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
