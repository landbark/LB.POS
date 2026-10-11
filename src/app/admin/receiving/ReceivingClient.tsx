'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, PackagePlus, Printer, PackageCheck, ListPlus, X, Search, Check } from 'lucide-react'
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
  product_lots?: { quantity: number }[]
}

const stockOf = (p: ProductOption) => (p.product_lots ?? []).reduce((s, l) => s + l.quantity, 0)

function matchProduct(p: ProductOption, q: string) {
  if (!q) return true
  return (
    p.name.toLowerCase().includes(q) ||
    (p.sku ?? '').toLowerCase().includes(q) ||
    (p.barcode ?? '').toLowerCase().includes(q)
  )
}

// ป้ายคงเหลือ — สต็อคหมดให้เด่นหน่อย เพราะเป็นตัวที่ควรสั่งเข้าก่อน
function StockBadge({ product }: { product: ProductOption }) {
  const n = stockOf(product)
  return (
    <span className={`text-xs ${n <= 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
      {n <= 0 ? 'หมด' : `คงเหลือ ${n}`} {product.unit}
    </span>
  )
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
  const hits = products.filter((p) => matchProduct(p, q))
  // เดิมตัดไว้แค่ 8 ตัว พิมพ์ค้นแล้วของที่ต้องการตกหล่นบ่อย — ยาวได้ ลิสต์เลื่อนอยู่แล้ว
  const matches = hits.slice(0, 50)

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
          {hits.length > matches.length && (
            <p className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 sticky top-0">
              เจอ {hits.length} รายการ — แสดง {matches.length} ตัวแรก พิมพ์เพิ่มเพื่อแคบลง
            </p>
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
              <p className="text-xs text-gray-400 flex items-center gap-2">
                {(p.sku || p.barcode) && (
                  <span className="font-mono">{[p.sku, p.barcode].filter(Boolean).join(' · ')}</span>
                )}
                <StockBadge product={p} />
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// เลือกสินค้าทีละหลายรายการ — ค้นด้วยชื่อ/รหัส/บาร์โค้ด เห็นสต็อคคงเหลือ ติ๊กแล้วเพิ่มรวดเดียว
function MultiPicker({
  products,
  supplierId,
  supplierName,
  alreadyPicked,
  onAdd,
  onClose,
}: {
  products: ProductOption[]
  supplierId: string
  supplierName: string
  alreadyPicked: Set<string>
  onAdd: (ids: string[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [onlySupplier, setOnlySupplier] = useState(!!supplierId)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const q = query.trim().toLowerCase()
  const hits = products.filter((p) => {
    if (onlySupplier && supplierId && p.supplier_id !== supplierId) return false
    return matchProduct(p, q)
  })
  const shown = hits.slice(0, 200)

  function toggle(id: string) {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">เลือกสินค้าหลายรายการ</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์ชื่อสินค้า / รหัสสินค้า / บาร์โค้ด..."
              className={`${inputClass} pl-9`}
            />
          </div>
          {supplierId && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={onlySupplier} onChange={(e) => setOnlySupplier(e.target.checked)} />
              เฉพาะสินค้าที่ผูกกับ {supplierName}
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {shown.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-gray-400">
              {onlySupplier ? 'ไม่พบสินค้าที่ผูกกับซัพพลายเออร์นี้ — ลองเอาเครื่องหมายถูกออก' : 'ไม่พบสินค้า'}
            </p>
          )}
          {shown.map((p) => {
            const added = alreadyPicked.has(p.id)
            const on = picked.has(p.id)
            return (
              <button
                type="button"
                key={p.id}
                disabled={added}
                onClick={() => toggle(p.id)}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-left ${
                  added ? 'opacity-40 cursor-not-allowed' : on ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center ${
                  on ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
                }`}>
                  {on && <Check size={13} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-900 truncate">
                    {p.name}
                    {supplierId && p.supplier_id === supplierId && <span className="text-yellow-500 ml-1">★</span>}
                    {added && <span className="text-xs text-gray-400 ml-1">(อยู่ในใบแล้ว)</span>}
                  </span>
                  <span className="block text-xs text-gray-400 font-mono truncate">
                    {[p.sku, p.barcode].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <StockBadge product={p} />
              </button>
            )
          })}
          {hits.length > shown.length && (
            <p className="px-5 py-3 text-center text-xs text-gray-400">
              เจอ {hits.length} รายการ — แสดง {shown.length} ตัวแรก พิมพ์ค้นหาเพื่อแคบลง
            </p>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={() => { onAdd([...picked]); onClose() }}
            disabled={picked.size === 0}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
          >
            เพิ่ม {picked.size > 0 ? `${picked.size} รายการ` : 'สินค้า'}
          </button>
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm px-4 py-2.5 rounded-lg">
            ปิด
          </button>
        </div>
      </div>
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
  const [showPicker, setShowPicker] = useState(false)

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

  // เพิ่มสินค้าหลายตัวรวดเดียว — เติมราคาทุนล่าสุดให้เลย แล้วเขียนทับแถวว่างที่ค้างอยู่
  function addMany(ids: string[]) {
    if (ids.length === 0) return
    const rows: ItemRow[] = ids.map((id) => {
      const p = products.find((x) => x.id === id)
      return { product_id: id, quantity: '1', unit_cost: p?.cost != null ? String(p.cost) : '' }
    })
    const kept = items.filter((it) => it.product_id)
    setItems([...kept, ...rows])
    toast.success(`เพิ่ม ${rows.length} รายการแล้ว`)
  }

  const pickedIds = new Set(items.map((it) => it.product_id).filter(Boolean))
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? ''

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

    if (iErr) {
      setLoading(false)
      toast.error('บันทึกรายการไม่สำเร็จ: ' + iErr.message)
      return
    }

    // สั่งของตัวนี้จากเจ้านี้ = ผูกให้เลย ครั้งหน้าจะขึ้นมาก่อนในช่องเลือก
    // แตะเฉพาะตัวที่ยังไม่มีเจ้าประจำ ไม่ไปทับของที่ตั้งไว้แล้ว
    let linked = 0
    if (supplierId) {
      const unlinked = validItems
        .map((it) => products.find((p) => p.id === it.product_id))
        .filter((p): p is ProductOption => !!p && !p.supplier_id)
        .map((p) => p.id)
      if (unlinked.length > 0) {
        const { error: linkErr } = await supabase
          .from('products')
          .update({ supplier_id: supplierId })
          .in('id', unlinked)
        if (!linkErr) linked = unlinked.length
      }
    }

    setLoading(false)

    // ยังไม่เพิ่มสต็อค — สต็อคจะเข้าตอนพนักงานกด "รับสินค้า" พร้อมใส่ล็อต/วันหมดอายุ
    toast.success(
      `บันทึกใบสั่งซื้อ ${validItems.length} รายการแล้ว รอรับสินค้า` +
      (linked > 0 ? ` · ผูก ${linked} สินค้ากับซัพพลายเออร์นี้ให้แล้ว` : '')
    )
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

        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium px-3 py-2 rounded-lg"
          >
            <ListPlus size={15} />
            เลือกสินค้าหลายรายการ
          </button>
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
                      {(() => {
                        const p = products.find((x) => x.id === it.product_id)
                        return p ? <p className="mt-0.5 pl-1"><StockBadge product={p} /></p> : null
                      })()}
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
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

      {showPicker && (
        <MultiPicker
          products={sortedProducts}
          supplierId={supplierId}
          supplierName={supplierName}
          alreadyPicked={pickedIds}
          onAdd={addMany}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>

  )
}
