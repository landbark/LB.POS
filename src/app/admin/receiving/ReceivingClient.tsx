'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, PackagePlus, Printer, PackageCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import type { PurchaseStatus, Supplier } from '@/lib/types'

interface ProductOption {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  unit: string
  cost: number | null
  supplier_id: string | null
}

interface PurchaseRow {
  id: string
  purchase_number: string
  total_cost: number
  notes: string | null
  status: PurchaseStatus
  created_at: string
  suppliers: { name: string } | null
  purchase_items: { id: string }[]
}

interface ItemRow {
  product_id: string
  quantity: string
  unit_cost: string
}

function newItem(): ItemRow {
  return { product_id: '', quantity: '', unit_cost: '' }
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// ช่องเลือกสินค้าแบบพิมพ์ค้นหา (ชื่อ / SKU / บาร์โค้ด)
function ProductPicker({
  products,
  value,
  onChange,
  supplierId,
}: {
  products: ProductOption[]
  value: string
  onChange: (id: string) => void
  supplierId: string
}) {
  const selected = products.find((p) => p.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const q = query.trim().toLowerCase()
  const matches = (q
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? '').toLowerCase().includes(q) ||
          (p.barcode ?? '').includes(q)
      )
    : products
  ).slice(0, 8)

  function pick(p: ProductOption) {
    onChange(p.id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : selected?.name ?? ''}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (matches[0]) pick(matches[0])
          }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="พิมพ์ชื่อ / SKU / บาร์โค้ด..."
        className={inputClass}
      />
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-64 overflow-y-auto">
          {matches.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-gray-400">ไม่พบสินค้า</p>
          )}
          {matches.map((p) => (
            <button
              type="button"
              key={p.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0"
            >
              <p className="text-sm text-gray-900">
                {p.name}
                {supplierId && p.supplier_id === supplierId && (
                  <span className="text-yellow-500 ml-1">★</span>
                )}
              </p>
              {(p.sku || p.barcode) && (
                <p className="text-xs text-gray-400 font-mono">
                  {[p.sku, p.barcode].filter(Boolean).join(' · ')}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  suppliers: Supplier[]
  products: ProductOption[]
  purchases: PurchaseRow[]
}

export default function ReceivingClient({ suppliers, products, purchases }: Props) {
  const router = useRouter()
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([newItem()])
  const [loading, setLoading] = useState(false)

  // สินค้าของซัพพลายเออร์ที่เลือกขึ้นก่อนในผลค้นหา
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
      const p = products.find((x) => x.id === value)
      if (p?.cost != null && !next[index].unit_cost) {
        next[index].unit_cost = p.cost.toString()
      }
    }
    setItems(next)
  }

  function addRow() {
    setItems([...items, newItem()])
  }

  function removeRow(index: number) {
    if (items.length === 1) {
      setItems([newItem()])
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
      }))
    )

    setLoading(false)
    if (iErr) {
      toast.error('บันทึกรายการไม่สำเร็จ: ' + iErr.message)
      return
    }

    // ยังไม่เพิ่มสต็อค — สต็อคจะเข้าตอนพนักงานกด "รับสินค้า" พร้อมใส่ล็อต/วันหมดอายุ
    toast.success(`บันทึกใบสั่งซื้อ ${validItems.length} รายการแล้ว รอรับสินค้า`)
    setSupplierId('')
    setNotes('')
    setItems([newItem()])
    router.refresh()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">นำเข้าสินค้า</h1>
      <p className="text-sm text-gray-500 mb-6">
        สร้างใบสั่งซื้อส่งซัพพลายเออร์ก่อน แล้วค่อยกด &quot;รับสินค้า&quot; ใส่ล็อต/วันหมดอายุตอนของมาส่งจริง
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">สร้างใบสั่งซื้อ</h2>
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

        {/* รายการสินค้า — ห้ามใส่ overflow-x-auto ที่นี่ เพราะจะ clip dropdown ของ ProductPicker */}
        <div>
          <table className="w-full">
            <thead>
              <tr className="text-xs font-medium text-gray-500 uppercase">
                <th className="text-left pb-2 pr-2 min-w-56">สินค้า</th>
                <th className="text-left pb-2 pr-2 w-24">จำนวน</th>
                <th className="text-left pb-2 pr-2 w-28">ทุน/หน่วย</th>
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
                      <ProductPicker
                        products={sortedProducts}
                        value={it.product_id}
                        onChange={(id) => setItem(i, 'product_id', id)}
                        supplierId={supplierId}
                      />
                    </td>
                    <td className="pr-2 py-1.5">
                      <input type="number" min="1" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} className={inputClass} placeholder="0" />
                    </td>
                    <td className="pr-2 py-1.5">
                      <input type="number" min="0" step="0.01" value={it.unit_cost} onChange={(e) => setItem(i, 'unit_cost', e.target.value)} className={inputClass} placeholder="0.00" />
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
            {loading ? 'กำลังบันทึก...' : 'บันทึกใบสั่งซื้อ'}
          </button>
        </div>
      </div>

      {/* ประวัติใบสั่งซื้อ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">ประวัติใบสั่งซื้อ</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เลขที่</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ซัพพลายเออร์</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">รายการ</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ทุนรวม</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
              <th className="px-4 py-3"></th>
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
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                    p.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {p.status === 'received' ? 'รับแล้ว' : 'รอรับสินค้า'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <Link
                      href={`/print/purchase/${p.id}`}
                      target="_blank"
                      title="พิมพ์ PDF"
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                    >
                      <Printer size={15} />
                    </Link>
                    {p.status === 'pending' && (
                      <Link
                        href={`/admin/receiving/${p.id}/receive`}
                        className="flex items-center gap-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <PackageCheck size={13} /> รับสินค้า
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {purchases.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีใบสั่งซื้อ</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
