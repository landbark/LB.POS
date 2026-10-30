'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, Trash2, ListPlus, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Supplier } from '@/lib/types'
import {
  ProductPicker, MultiPicker, StockBadge, UnitSelect, newItem, inputClass, qtyInputClass,
  findUnitChoice, factorOfRow, useUnitAdder,
  type ProductOption, type ItemRow,
} from '../../pickers'

interface Purchase {
  id: string
  purchase_number: string
  supplier_id: string | null
  notes: string | null
  purchase_items: { id: string; product_id: string | null; product_unit_id: string | null; quantity: number; unit_cost: number }[]
}

export default function EditPurchaseClient({
  purchase, suppliers, products,
}: {
  purchase: Purchase
  suppliers: Supplier[]
  products: ProductOption[]
}) {
  const router = useRouter()
  const addUnit = useUnitAdder(products)
  const [supplierId, setSupplierId] = useState(purchase.supplier_id ?? '')
  const [notes, setNotes] = useState(purchase.notes ?? '')
  const [items, setItems] = useState<ItemRow[]>(
    purchase.purchase_items.length > 0
      ? purchase.purchase_items.map((it) => ({
          product_id: it.product_id ?? '',
          product_unit_id: it.product_unit_id ?? '',
          quantity: String(it.quantity),
          unit_cost: String(it.unit_cost),
        }))
      : [newItem()],
  )
  const [loading, setLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

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
    if (key === 'product_id') {
      next[index].product_unit_id = ''
      const p = products.find((x) => x.id === value)
      if (p?.cost != null && !next[index].unit_cost) next[index].unit_cost = p.cost.toString()
    }
    if (key === 'product_id' || key === 'product_unit_id') {
      const p = products.find((x) => x.id === next[index].product_id)
      const choice = findUnitChoice(p, next[index].product_unit_id)
      if (choice?.cost != null) next[index].unit_cost = String(choice.cost)
    }
    setItems(next)
  }

  function addMany(ids: string[]) {
    if (ids.length === 0) return
    const rows: ItemRow[] = ids.map((id) => {
      const p = products.find((x) => x.id === id)
      return { product_id: id, product_unit_id: '', quantity: '1', unit_cost: p?.cost != null ? String(p.cost) : '' }
    })
    setItems([...items.filter((it) => it.product_id), ...rows])
    toast.success(`เพิ่ม ${rows.length} รายการแล้ว`)
  }

  function removeRow(index: number) {
    if (items.length === 1) { setItems([newItem()]); return }
    setItems(items.filter((_, i) => i !== index))
  }

  const validItems = items.filter((it) => it.product_id && parseInt(it.quantity) > 0)
  const totalCost = validItems.reduce(
    (sum, it) => sum + (parseFloat(it.unit_cost) || 0) * (parseInt(it.quantity) || 0), 0,
  )

  async function save() {
    if (validItems.length === 0) {
      toast.error('ใส่รายการสินค้าอย่างน้อย 1 รายการ')
      return
    }
    setLoading(true)
    const supabase = createClient()

    // ใบนี้ยังไม่ได้รับของ รายการเลยยังไม่ผูกกับล็อตไหน — ลบทิ้งแล้วเขียนใหม่ทั้งชุดง่ายและไม่หลุด
    const { error: delErr } = await supabase.from('purchase_items').delete().eq('purchase_id', purchase.id)
    if (delErr) {
      toast.error('บันทึกไม่สำเร็จ: ' + delErr.message)
      setLoading(false)
      return
    }

    const { error: insErr } = await supabase.from('purchase_items').insert(
      validItems.map((it) => {
        const p = products.find((x) => x.id === it.product_id)
        const choice = findUnitChoice(p, it.product_unit_id)
        return {
          purchase_id: purchase.id,
          product_id: it.product_id,
          product_unit_id: choice?.unit?.id ?? null,
          unit_factor: choice?.factor ?? 1,
          unit_name: choice?.unit?.unit_name ?? null,
          quantity: parseInt(it.quantity),
          unit_cost: parseFloat(it.unit_cost) || 0,
        }
      }),
    )
    if (insErr) {
      toast.error('บันทึกรายการไม่สำเร็จ: ' + insErr.message)
      setLoading(false)
      return
    }

    const { error: pErr } = await supabase
      .from('purchases')
      .update({ supplier_id: supplierId || null, notes: notes.trim() || null, total_cost: totalCost })
      .eq('id', purchase.id)

    setLoading(false)
    if (pErr) {
      toast.error('บันทึกหัวใบไม่สำเร็จ: ' + pErr.message)
      return
    }

    toast.success(`แก้ไขใบสั่งซื้อ ${purchase.purchase_number} แล้ว`)
    router.push('/admin/receiving')
    router.refresh()
  }

  return (
    <div>
      <Link href="/admin/receiving" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} /> กลับไปหน้านำเข้าสินค้า
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">แก้ไขใบสั่งซื้อ</h1>
      <p className="text-sm text-gray-500 mb-6">
        <span className="font-mono">{purchase.purchase_number}</span> · ยังไม่ได้รับของ แก้ได้ทั้งใบ
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ซัพพลายเออร์</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
              <option value="">— ไม่ระบุ —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="เช่น เลขที่บิล / รอบส่ง" />
          </div>
        </div>

        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium px-3 py-2 rounded-lg"
          >
            <ListPlus size={15} /> เลือกสินค้าหลายรายการ
          </button>
        </div>

        {/* ตารางแคบพอ ไม่ต้อง overflow-x-auto (dropdown ของ ProductPicker ลอยที่ body อยู่แล้ว) */}
        <div>
          <table className="w-full">
            <thead>
              <tr className="text-xs font-medium text-gray-500 uppercase">
                <th className="text-left pb-2 pr-2 min-w-56">สินค้า</th>
                <th className="text-left pb-2 pr-2 min-w-56 whitespace-nowrap">จำนวน / หน่วย</th>
                <th className="text-left pb-2 pr-2 w-28">ทุน/หน่วยที่สั่ง</th>
                <th className="text-right pb-2 w-24">รวม</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const rowTotal = (parseFloat(it.unit_cost) || 0) * (parseInt(it.quantity) || 0)
                const p = products.find((x) => x.id === it.product_id)
                return (
                  <tr key={i}>
                    <td className="pr-2 py-1.5 align-top">
                      <ProductPicker
                        products={sortedProducts}
                        value={it.product_id}
                        onChange={(id) => setItem(i, 'product_id', id)}
                        supplierId={supplierId}
                      />
                      {p && <p className="mt-0.5 pl-1"><StockBadge product={p} /></p>}
                    </td>
                    <td className="pr-2 py-1.5 align-top">
                      <div className="flex items-center gap-1.5">
                        <input type="number" min="1" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} className={qtyInputClass} placeholder="0" />
                        <UnitSelect product={p} value={it.product_unit_id} onChange={(id) => setItem(i, 'product_unit_id', id)} onUnitAdded={addUnit} />
                      </div>
                      {factorOfRow(p, it.product_unit_id) > 1 && (parseInt(it.quantity) || 0) > 0 && (
                        <p className="mt-0.5 pl-1 text-[11px] text-gray-400">
                          เข้าสต็อค {(parseInt(it.quantity) || 0) * factorOfRow(p, it.product_unit_id)} {p?.unit}
                        </p>
                      )}
                    </td>
                    <td className="pr-2 py-1.5 align-top">
                      <input type="number" min="0" step="0.01" value={it.unit_cost} onChange={(e) => setItem(i, 'unit_cost', e.target.value)} className={inputClass} placeholder="0.00" />
                    </td>
                    <td className="py-1.5 pt-4 align-top text-sm text-right font-medium text-gray-900">
                      {rowTotal > 0 ? `฿${rowTotal.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-1.5 pt-3 align-top text-right">
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

        <button onClick={() => setItems([...items, newItem()])} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium mt-2">
          <Plus size={14} /> เพิ่มรายการ
        </button>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            {validItems.length} รายการ · ทุนรวม{' '}
            <span className="font-bold text-gray-900">฿{totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
          </p>
          <button
            onClick={save}
            disabled={loading || validItems.length === 0}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            <Save size={16} />
            {loading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </div>

      {showPicker && (
        <MultiPicker
          products={sortedProducts}
          supplierId={supplierId}
          supplierName={suppliers.find((s) => s.id === supplierId)?.name ?? ''}
          alreadyPicked={new Set(items.map((it) => it.product_id).filter(Boolean))}
          onAdd={addMany}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
