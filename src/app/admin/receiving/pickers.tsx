'use client'

import { useState } from 'react'
import { ListPlus, X, Search, Check } from 'lucide-react'
import type { ProductUnit } from '@/lib/types'
import { purchaseUnitChoices } from '@/lib/productUnits'

export interface ProductOption {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  unit: string
  cost: number | null
  supplier_id: string | null
  product_lots?: { quantity: number }[]
  /** หน่วยใหญ่ที่สั่งได้ (ลัง/กล่อง) — สั่งเป็นลังแต่สต็อคเข้าเป็นหน่วยย่อย */
  product_units?: ProductUnit[]
}

export const stockOf = (p: ProductOption) => (p.product_lots ?? []).reduce((s, l) => s + l.quantity, 0)

/** หน่วยที่เลือกได้ตอนสั่งของ — ค้นด้วย id ของแถวหน่วย ('' = หน่วยฐาน) */
export const unitChoicesOf = (p: ProductOption | undefined) => (p ? purchaseUnitChoices(p) : [])

export const findUnitChoice = (p: ProductOption | undefined, unitId: string) =>
  unitChoicesOf(p).find((c) => (c.unit?.id ?? '') === unitId)

/** จำนวนหน่วยฐานที่จะเข้าสต็อคจริงจากแถวสั่งซื้อหนึ่งแถว */
export const factorOfRow = (p: ProductOption | undefined, unitId: string) =>
  findUnitChoice(p, unitId)?.factor ?? 1

export function matchProduct(p: ProductOption, q: string) {
  if (!q) return true
  return (
    p.name.toLowerCase().includes(q) ||
    (p.sku ?? '').toLowerCase().includes(q) ||
    (p.barcode ?? '').toLowerCase().includes(q)
  )
}

// ป้ายคงเหลือ — สต็อคหมดให้เด่นหน่อย เพราะเป็นตัวที่ควรสั่งเข้าก่อน
export function StockBadge({ product }: { product: ProductOption }) {
  const n = stockOf(product)
  return (
    <span className={`text-xs ${n <= 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
      {n <= 0 ? 'หมด' : `คงเหลือ ${n}`} {product.unit}
    </span>
  )
}

export interface ItemRow {
  product_id: string
  /** id ของแถวหน่วยใหญ่ที่สั่ง ('' = สั่งเป็นหน่วยฐาน) */
  product_unit_id: string
  quantity: string
  unit_cost: string
}

export function newItem(): ItemRow {
  return { product_id: '', product_unit_id: '', quantity: '', unit_cost: '' }
}

/** ช่องเลือกหน่วยที่สั่ง — สินค้าที่ไม่มีหน่วยใหญ่จะโชว์แค่ชื่อหน่วยเฉยๆ */
export function UnitSelect({
  product,
  value,
  onChange,
}: {
  product: ProductOption | undefined
  value: string
  onChange: (unitId: string) => void
}) {
  const choices = unitChoicesOf(product)
  if (!product) return null
  if (choices.length <= 1) return <span className="shrink-0 text-xs text-gray-500">{product.unit}</span>
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="shrink-0 border border-gray-300 rounded-lg px-1.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {choices.map((c) => (
        <option key={c.unit?.id ?? 'base'} value={c.unit?.id ?? ''}>
          {c.name}{c.factor > 1 ? ` (${c.factor})` : ''}
        </option>
      ))}
    </select>
  )
}

export const inputClass = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// ช่องเลือกสินค้าแบบพิมพ์ค้นหา (ชื่อ / SKU / บาร์โค้ด)
export function ProductPicker({
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
export function MultiPicker({
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
