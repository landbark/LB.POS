'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Check, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import type { ProductUnit } from '@/lib/types'
import { purchaseUnitChoices } from '@/lib/productUnits'
import BarcodeField from '@/components/BarcodeField'

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
  onUnitAdded,
}: {
  product: ProductOption | undefined
  value: string
  onChange: (unitId: string) => void
  /** ส่งมาด้วย = มีปุ่มเพิ่มหน่วยใหญ่ให้ตั้งจากในฟอร์มนี้เลย ไม่ต้องไปตั้งที่หน้าสินค้าก่อน */
  onUnitAdded?: (unit: ProductUnit) => void
}) {
  const [adding, setAdding] = useState(false)
  const choices = unitChoicesOf(product)
  if (!product) return null
  return (
    <span className="flex shrink-0 items-center gap-1">
      {choices.length <= 1 ? (
        <span className="text-xs text-gray-500">{product.unit}</span>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-1.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {choices.map((c) => (
            <option key={c.unit?.id ?? 'base'} value={c.unit?.id ?? ''}>
              {c.name}{c.factor > 1 ? ` (${c.factor})` : ''}
            </option>
          ))}
        </select>
      )}
      {onUnitAdded && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          title={`เพิ่มหน่วยใหญ่ของ ${product.name} เช่น ลัง / กล่อง`}
          className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <Plus size={14} />
        </button>
      )}
      {adding && onUnitAdded && (
        <AddUnitModal
          product={product}
          onClose={() => setAdding(false)}
          onCreated={(unit) => {
            onUnitAdded(unit)
            onChange(unit.id)
            setAdding(false)
          }}
        />
      )}
    </span>
  )
}

/**
 * ตั้งหน่วยใหญ่ (ลัง/กล่อง) ของสินค้าตัวหนึ่งจากในใบสั่งซื้อ
 *
 * ของมาเป็นลังแต่สินค้ายังไม่เคยตั้งหน่วยลังไว้ เดิมต้องทิ้งใบที่กรอกค้างไว้ ไปตั้งที่หน้าสินค้า
 * แล้วกลับมาเริ่มใหม่ — ค่าที่กรอกตรงนี้ไปลงที่ **ตัวสินค้า** เหมือนตั้งจากหน้าสินค้า ใช้ได้ทุกใบ
 *
 * เริ่มที่ปิดขายหน้าร้าน เพราะลังส่วนใหญ่ไว้สั่งของเท่านั้น (ติ๊กเปิดได้ถ้าจะขายยกลังด้วย)
 */
function AddUnitModal({
  product,
  onClose,
  onCreated,
}: {
  product: ProductOption
  onClose: () => void
  onCreated: (unit: ProductUnit) => void
}) {
  const [unitName, setUnitName] = useState('')
  const [factor, setFactor] = useState('')
  const [cost, setCost] = useState('')
  const [barcode, setBarcode] = useState('')
  const [sellPos, setSellPos] = useState(false)
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)

  const name = unitName.trim() || 'หน่วย'
  const n = parseInt(factor, 10) || 0

  async function save() {
    if (!unitName.trim()) {
      toast.error('ใส่ชื่อหน่วย เช่น กล่อง / ลัง')
      return
    }
    if (n < 2) {
      toast.error(`ใส่จำนวน ${product.unit} ต่อ 1 ${name} (ตั้งแต่ 2 ขึ้นไป)`)
      return
    }
    setBusy(true)
    const { data, error } = await createClient()
      .from('product_units')
      .insert({
        product_id: product.id,
        unit_name: unitName.trim(),
        factor: n,
        sku: null,
        barcode: barcode.trim() || null,
        // ไม่ใส่ราคา = ขายเท่าราคาหน่วยย่อยคูณตัวคูณ (ไม่ลด)
        price: price.trim() ? parseFloat(price) : null,
        cost: cost.trim() ? parseFloat(cost) : null,
        sellable_pos: sellPos,
        sellable_online: false,
        purchasable: true,
        sort_order: n,
      })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) {
      toast.error(
        error?.code === '23505'
          ? `สินค้านี้มีหน่วย ${unitName.trim()} อยู่แล้ว (หรือบาร์โค้ดซ้ำกับที่อื่น)`
          : 'เพิ่มหน่วยไม่สำเร็จ: ' + (error?.message ?? ''),
      )
      return
    }
    toast.success(`เพิ่มหน่วย ${unitName.trim()} — 1 ${unitName.trim()} = ${n} ${product.unit}`)
    onCreated(data as ProductUnit)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900">เพิ่มหน่วยใหญ่</h2>
            <p className="truncate text-xs text-gray-500">{product.name} — หน่วยย่อยคือ {product.unit}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-3" onKeyDown={(e) => { if (e.key === 'Enter' && !busy) { e.preventDefault(); void save() } }}>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-500">ชื่อหน่วย</span>
              <input autoFocus value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="ลัง" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">1 {name} = กี่ {product.unit}</span>
              <input type="number" min="2" step="1" value={factor} onChange={(e) => setFactor(e.target.value)} placeholder="12" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">ทุนต่อ 1 {name}</span>
              <input
                type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)}
                placeholder={product.cost != null && n >= 2 ? (product.cost * n).toFixed(2) : '0.00'}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">บาร์โค้ดข้างลัง</span>
              <BarcodeField
                value={barcode}
                onChange={setBarcode}
                className={inputClass}
                placeholder="ไม่มีก็ได้"
                title={`บาร์โค้ดข้าง${name}`}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={sellPos} onChange={(e) => setSellPos(e.target.checked)} className="h-4 w-4" />
            ขายยก{name}ที่หน้าร้านด้วย
          </label>
          {sellPos && (
            <label className="block">
              <span className="text-xs text-gray-500">ราคาขายต่อ 1 {name} (เว้นว่าง = ไม่ลด)</span>
              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className={inputClass} />
            </label>
          )}

          <p className="text-xs text-gray-400">
            หน่วยนี้ไปอยู่ที่ตัวสินค้า — ใบอื่นเลือกได้ด้วย และสต็อคยังนับเป็น{product.unit}กองเดียวตามเดิม
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">ยกเลิก</button>
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Check size={15} /> {busy ? 'กำลังบันทึก...' : 'เพิ่มหน่วย'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * รับหน่วยที่เพิ่งสร้างจากในฟอร์มเข้าลิสต์สินค้า — ใบที่กรอกค้างอยู่ต้องเลือกได้ทันที
 * ไม่ใช่รอ router.refresh()
 *
 * เขียนเพิ่มลงในตัวสินค้าตัวเดิม ไม่ได้ copy ลิสต์ใหม่ เพราะตัวจัดการเหตุการณ์ของฟอร์ม
 * (ตอนเติมทุนต่อหน่วยให้แถวที่เพิ่งเลือกหน่วยใหม่) ปิดทับลิสต์ของ render นั้นไว้ —
 * ถ้า copy ใหม่ โค้ดที่กำลังทำงานอยู่จะยังอ่านลิสต์เก่า หาหน่วยที่เพิ่งสร้างไม่เจอ
 * แล้วทุนต่อลังที่กรอกไว้จะไม่ถูกเติมลงช่อง ของจริงมาจาก router.refresh() รอบถัดไป
 */
export function useUnitAdder(products: ProductOption[]) {
  const [, rerender] = useState(0)
  return useCallback(
    (unit: ProductUnit) => {
      const product = products.find((p) => p.id === unit.product_id)
      if (!product) return
      product.product_units = [...(product.product_units ?? []), unit]
      rerender((n) => n + 1)
    },
    [products],
  )
}

export const inputClass = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

/** ความสูงสูงสุดของลิสต์ และระยะห่างจากช่องพิมพ์ */
const MENU_MAX_H = 256
const MENU_GAP = 4

interface MenuBox { left: number; top: number; width: number; maxHeight: number; above: boolean }

/**
 * ตำแหน่งของลิสต์ที่ลอยอยู่ — วัดจากช่องพิมพ์ทุกครั้งที่เปิด/เลื่อน/ย่อขยายจอ
 *
 * ลิสต์ต้องวาดที่ body แบบ fixed ไม่ใช่ absolute ใต้ช่องพิมพ์ เพราะหน้ารับสินค้า
 * วางตารางไว้ในกล่อง overflow-x-auto (ตารางกว้างเกินจอ) — กล่องนั้น clip ลิสต์
 * ทิ้งเกือบหมด พนักงานเลยเลือกสินค้าที่เพิ่งเพิ่มเข้าใบไม่ได้
 */
function useMenuBox(anchor: React.RefObject<HTMLDivElement | null>, open: boolean) {
  const [box, setBox] = useState<MenuBox | null>(null)

  const measure = useCallback(() => {
    const el = anchor.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - MENU_GAP
    const above = r.top - MENU_GAP
    // ช่องพิมพ์อยู่ท้ายจอแล้วที่ว่างข้างล่างไม่พอ — พลิกลิสต์ขึ้นข้างบนแทน
    const flip = below < 160 && above > below
    setBox({
      left: r.left,
      top: flip ? r.top - MENU_GAP : r.bottom + MENU_GAP,
      width: r.width,
      maxHeight: Math.min(MENU_MAX_H, Math.max(120, flip ? above : below)),
      above: flip,
    })
  }, [anchor])

  useEffect(() => {
    if (!open) return
    // capture = true เพราะกล่องตารางเลื่อนเองได้ ไม่ใช่แค่ทั้งหน้า
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [measure, open])

  return { box, measure }
}

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
  const anchorRef = useRef<HTMLDivElement>(null)
  const { box, measure } = useMenuBox(anchorRef, open)

  const q = query.trim().toLowerCase()
  const hits = products.filter((p) => matchProduct(p, q))
  // เดิมตัดไว้แค่ 8 ตัว พิมพ์ค้นแล้วของที่ต้องการตกหล่นบ่อย — ยาวได้ ลิสต์เลื่อนอยู่แล้ว
  const matches = hits.slice(0, 50)

  function pick(p: ProductOption) {
    onChange(p.id)
    setOpen(false)
    setQuery('')
  }

  const menu = (b: MenuBox) => (
    <div
      style={{
        position: 'fixed',
        left: b.left,
        top: b.top,
        width: b.width,
        maxHeight: b.maxHeight,
        // พลิกขึ้นข้างบน = ยกลิสต์ขึ้นเท่าความสูงของตัวเอง
        transform: b.above ? 'translateY(-100%)' : undefined,
      }}
      className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto"
    >
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
  )

  return (
    <div ref={anchorRef} className="relative">
      <input
        type="text"
        value={open ? query : selected?.name ?? ''}
        onFocus={() => { measure(); setOpen(true); setQuery('') }}
        onChange={(e) => { measure(); setQuery(e.target.value); setOpen(true) }}
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
      {open && box && createPortal(menu(box), document.body)}
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
