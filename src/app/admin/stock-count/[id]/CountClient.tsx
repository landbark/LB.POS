'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ScanLine, ScanSearch, Search, Trash2, Check, X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import BarcodeScanner, { type ScanFeedback } from '@/components/BarcodeScanner'
import ScanList from '@/components/ScanList'
import DateField from '@/components/DateField'
import { confirmDialog } from '@/lib/confirm'
import { findByBarcode } from '@/lib/productUnits'
import {
  canStampExpiry,
  countUnitChoices,
  lotsWithStock,
  stockOf,
  summarize,
  varianceOf,
  type CountableProduct,
  type CountLot,
} from '@/lib/stockCount'
import type { ProductUnit, StockCount } from '@/lib/types'

interface ItemRow {
  id: string
  product_id: string
  /** null = นับรวมทุก lot */
  product_lot_id: string | null
  counted_quantity: number
  system_quantity: number
  applied_diff: number | null
  expiry_date: string | null
  note: string | null
  counted_at: string
  counter: { name: string | null } | null
}

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const fmtBaht = (n: number) => `${n < 0 ? '-' : ''}฿${Math.abs(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })

/** หนึ่งแถว = (สินค้า, lot) — ใช้เป็นคีย์ทั้งตอนหาแถวเดิมและตอนจำยอดที่กำลังบันทึก */
const keyOf = (productId: string, lotId: string | null) => `${productId}|${lotId ?? ''}`

/**
 * ยิงบาร์โค้ดได้สองแบบ
 * - tally: ยิงทุกชิ้นบนชั้น ระบบบวกให้ทีละชิ้น (ยิงลัง = บวกทั้งลัง)
 * - find:  นับแยกมาแล้วด้วยมือ ยิงแค่ให้มันหาสินค้าตัวนั้นมาให้ แล้วใส่ยอดรวมทีเดียว
 */
type ScanMode = 'tally' | 'find'

const lotLabel = (lot: CountLot) =>
  [
    lot.lot_number || 'ไม่มีเลข lot',
    lot.expiry_date ? `หมด ${fmtDate(lot.expiry_date)}` : 'ไม่มีวันหมดอายุ',
    `มี ${lot.quantity}`,
  ].join(' · ')

export default function CountClient({
  count,
  initialItems,
  products,
  userId,
}: {
  count: StockCount
  initialItems: ItemRow[]
  products: CountableProduct[]
  userId: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState<ItemRow[]>(initialItems)
  const [scanMode, setScanMode] = useState<ScanMode | null>(null)
  // แถวที่เพิ่งยิงเข้ามา — ไฮไลต์ในรายการใต้กล้องให้เห็นว่าเลขไหนเพิ่งขยับ
  const [lastTallyKey, setLastTallyKey] = useState<string | null>(null)
  const [term, setTerm] = useState('')
  const [picked, setPicked] = useState<CountableProduct | null>(null)
  const [qty, setQty] = useState('')
  const [unitIdx, setUnitIdx] = useState(0)
  const [lotId, setLotId] = useState<string | null>(null)
  const [expiry, setExpiry] = useState('')
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)
  const [showRemaining, setShowRemaining] = useState(false)
  const qtyRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // ยิงบาร์โค้ดรัว ๆ เร็วกว่า setState จะ flush — เก็บสำเนาที่อัปเดตทันทีไว้ใช้หาแถวเดิม
  // และจำยอดที่ "กำลังจะเป็น" ไว้ ไม่งั้นยิงสองครั้งติดกันจะอ่านยอดเก่าทั้งคู่แล้วนับหาย
  const rowsRef = useRef<ItemRow[]>(initialItems)
  const intendedRef = useRef(new Map<string, number>())
  // บันทึกทีละคำสั่งเรียงกัน — ยิงรัว ๆ แล้วส่งพร้อมกันจะชน unique (รอบ, สินค้า, lot)
  const chainRef = useRef<Promise<unknown>>(Promise.resolve())

  const locked = count.status !== 'counting'
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const lotById = useMemo(() => {
    const m = new Map<string, CountLot>()
    for (const p of products) for (const l of p.product_lots ?? []) m.set(l.id, l)
    return m
  }, [products])

  // สินค้าในขอบเขตของรอบนี้ — ไว้บอกว่ายังเหลืออะไรยังไม่นับ
  const inScope = useMemo(
    () => (count.category_id ? products.filter((p) => p.category_id === count.category_id) : products),
    [products, count.category_id]
  )

  const summary = useMemo(
    () => summarize(rows.map((r) => ({ ...r, cost: byId.get(r.product_id)?.cost ?? null }))),
    [rows, byId]
  )

  /** สินค้าถือว่านับครบเมื่อนับรวมทุก lot ไว้ หรือนับแยกครบทุก lot ที่มีของ */
  const remaining = useMemo(() => {
    const whole = new Set(rows.filter((r) => !r.product_lot_id).map((r) => r.product_id))
    const countedLots = new Set(rows.map((r) => r.product_lot_id).filter(Boolean) as string[])
    return inScope.filter((p) => {
      if (whole.has(p.id)) return false
      const lots = lotsWithStock(p)
      return lots.length === 0 || !lots.every((l) => countedLots.has(l.id))
    })
  }, [inScope, rows])

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (q.length < 2) return []
    return products
      .filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
      )
      .slice(0, 12)
  }, [term, products])

  /** แถวเดิมของ (สินค้า, lot) นั้น อ่านจากสำเนาที่อัปเดตทันที ไม่ใช่ state ที่ยังไม่ flush */
  const findRow = (productId: string, lot: string | null) =>
    rowsRef.current.find((r) => r.product_id === productId && (r.product_lot_id ?? null) === lot)

  function writeRows(next: ItemRow[]) {
    rowsRef.current = next
    setRows(next)
  }

  /**
   * เขียนผลการนับของ (สินค้า, lot) หนึ่งคู่ — นับซ้ำ = ทับของเดิม
   *
   * นับรวมทุก lot กับนับแยก lot ของสินค้าตัวเดียวกันในรอบเดียวกันไม่ได้
   * ไม่งั้นตอนยืนยันจะปรับสองรอบ ของที่ขาดอยู่ 2 ชิ้นจะถูกตัดไป 4
   */
  async function saveCount(
    product: CountableProduct,
    lot: string | null,
    counted: number,
    rowNote: string | null,
    expiryDate: string | null
  ) {
    const mixed = lot
      ? rowsRef.current.some((r) => r.product_id === product.id && !r.product_lot_id)
      : rowsRef.current.some((r) => r.product_id === product.id && r.product_lot_id)
    if (mixed) {
      toast.error(
        lot
          ? 'สินค้านี้นับรวมทุก lot ไว้แล้ว — เอาแถวเดิมออกก่อนถ้าจะนับแยก lot'
          : 'สินค้านี้นับแยก lot ไว้แล้ว — เอาแถวเดิมออกก่อนถ้าจะนับรวม'
      )
      return false
    }

    const existing = findRow(product.id, lot)
    // ยอดระบบล็อกไว้ตั้งแต่ครั้งแรกที่นับคู่นี้ — นับซ้ำ/แก้ตัวเลขไม่ควรเลื่อนฐานเทียบตาม
    const system = existing?.system_quantity ?? (lot ? lotById.get(lot)?.quantity ?? 0 : stockOf(product))
    const countedAt = new Date().toISOString()

    const supabase = createClient()
    const payload = {
      count_id: count.id,
      product_id: product.id,
      product_lot_id: lot,
      counted_quantity: counted,
      system_quantity: system,
      expiry_date: expiryDate,
      note: rowNote,
      counted_by: userId || null,
      counted_at: countedAt,
    }

    const { data, error } = existing
      ? await supabase.from('stock_count_items').update(payload).eq('id', existing.id).select('id').single()
      : await supabase.from('stock_count_items').insert(payload).select('id').single()

    if (error || !data) {
      toast.error('บันทึกไม่สำเร็จ: ' + (error?.message ?? ''))
      return false
    }

    const row: ItemRow = {
      id: data.id,
      product_id: product.id,
      product_lot_id: lot,
      counted_quantity: counted,
      system_quantity: system,
      applied_diff: null,
      expiry_date: expiryDate,
      note: rowNote,
      counted_at: countedAt,
      counter: existing?.counter ?? null,
    }
    writeRows([row, ...rowsRef.current.filter((r) => r.id !== row.id && r !== existing)])
    intendedRef.current.set(keyOf(product.id, lot), counted)
    return true
  }

  /** ต่อคิวการบันทึก — ยิงบาร์โค้ดรัว ๆ ต้องลงฐานข้อมูลเรียงกัน ไม่ใช่พร้อมกัน */
  function queueSave(...args: Parameters<typeof saveCount>) {
    const run = () => saveCount(...args)
    const next = chainRef.current.then(run, run)
    chainRef.current = next.catch(() => {})
    return next
  }

  /** หาสินค้าจากรหัสที่ยิงมา — บาร์โค้ด (ของตัวสินค้าหรือของลัง) ก่อน ไม่เจอค่อยลอง SKU */
  function lookup(code: string): { product: CountableProduct; unit: ProductUnit | null } | null {
    const hit = findByBarcode(products, code)
    if (hit) return hit
    const lower = code.trim().toLowerCase()
    const p = products.find((x) => x.sku?.toLowerCase() === lower)
    return p ? { product: p, unit: null } : null
  }

  /**
   * โหมดหาสินค้า — ยิงหนึ่งครั้งแล้วเปิดสินค้าตัวนั้นขึ้นมาให้ใส่จำนวน
   *
   * คนนับมักนับของกองนั้นแยกไว้ก่อนแล้วค่อยมาคีย์ยอดรวมทีเดียว ไม่ได้ยิงทุกชิ้น
   * ยิงลังก็ตั้งหน่วยเป็นลังให้เลย คีย์ "3" แล้วได้ 3 ลัง
   */
  function handleFind(code: string): ScanFeedback {
    if (locked) return { ok: false, message: 'รอบนี้ปิดแล้ว' }

    const hit = lookup(code)
    if (!hit) return { ok: false, message: `ไม่พบสินค้าจากรหัส ${code}` }

    setScanMode(null)
    pick(hit.product, hit.unit)
    return { ok: true, message: `${hit.product.name} — ใส่จำนวนที่นับได้` }
  }

  /** โหมดนับทีละชิ้น = ยิงแล้วบวกทีละชิ้น (ยิงลัง = บวกทั้งลัง) นับของบนชั้นได้โดยไม่ต้องพิมพ์ */
  function handleTally(code: string): ScanFeedback {
    if (locked) return { ok: false, message: 'รอบนี้ปิดแล้ว' }

    const bySku = lookup(code)
    if (!bySku) return { ok: false, message: `ไม่พบสินค้าจากรหัส ${code}` }

    const { product, unit } = bySku
    // บาร์โค้ดบอกไม่ได้ว่าของชิ้นนี้ lot ไหน — ถ้านับแยก lot ไว้แล้วก็บวกเข้า lot นั้น
    // ได้เมื่อมีอยู่ lot เดียว มากกว่านั้นต้องให้คนเลือกเอง
    const lotRows = rowsRef.current.filter((r) => r.product_id === product.id && r.product_lot_id)
    if (lotRows.length > 1) {
      return { ok: false, message: `${product.name} นับแยก lot ไว้หลาย lot — เลือก lot ในตารางเอง` }
    }
    const lot = lotRows[0]?.product_lot_id ?? null

    const key = keyOf(product.id, lot)
    const step = unit?.factor ?? 1
    const existing = findRow(product.id, lot)
    const current = intendedRef.current.get(key) ?? existing?.counted_quantity ?? 0
    const next = current + step
    intendedRef.current.set(key, next)

    setLastTallyKey(key)
    // หมายเหตุ/วันหมดอายุที่กรอกไว้แล้วต้องติดไปด้วย ไม่งั้นยิงชิ้นถัดไปแล้วล้างทิ้ง
    void queueSave(product, lot, next, existing?.note ?? null, existing?.expiry_date ?? null)
    const where = lot ? ` (lot ${lotById.get(lot)?.lot_number || '—'})` : ''
    return { ok: true, message: `${product.name}${where} — นับได้ ${next} ${product.unit}` }
  }

  /**
   * ผลนับของรอบนี้ในรูปแบบของแผงใต้กล้อง (rows ใหม่สุดอยู่บนสุดอยู่แล้ว)
   *
   * โชว์ทุกแถวของรอบ ไม่ใช่แค่ที่ยิงรอบนี้ — ยิงเกินไปชิ้นเดียวก็กดลบในนี้ได้เลย
   * ไม่ต้องปิดกล้องลงไปหาในตาราง
   */
  const scanRows = rows.map((r) => {
    const lot = r.product_lot_id ? lotById.get(r.product_lot_id) : null
    const product = byId.get(r.product_id)
    return {
      key: keyOf(r.product_id, r.product_lot_id),
      name: product?.name ?? 'สินค้าที่ถูกลบไปแล้ว',
      sub: `${lot ? `lot ${lot.lot_number || '—'} · ` : ''}ระบบมี ${r.system_quantity}`,
      qty: r.counted_quantity,
      unit: product?.unit ?? null,
    }
  })

  function setTallyQty(key: string, qty: number) {
    if (locked) return
    const row = rows.find((r) => keyOf(r.product_id, r.product_lot_id) === key)
    const product = row ? byId.get(row.product_id) : null
    if (!row || !product) return
    intendedRef.current.set(key, qty)
    setLastTallyKey(key)
    void queueSave(product, row.product_lot_id, qty, row.note, row.expiry_date)
  }

  function removeTallyRow(key: string) {
    if (locked) return
    const row = rows.find((r) => keyOf(r.product_id, r.product_lot_id) === key)
    if (row) void removeRow(row)
  }

  /** เปิดฟอร์มใส่จำนวนของสินค้าตัวหนึ่ง — scannedUnit มาจากบาร์โค้ดลังที่ยิงในโหมดหาสินค้า */
  function pick(product: CountableProduct, scannedUnit: ProductUnit | null = null) {
    const lots = lotsWithStock(product)
    const wholeRow = rowsRef.current.find((r) => r.product_id === product.id && !r.product_lot_id)
    const lotRow = rowsRef.current.find((r) => r.product_id === product.id && r.product_lot_id)
    // นับแยก lot ไว้แล้วก็เปิดที่ lot นั้นต่อ ไม่งั้นเริ่มที่ "รวมทุก lot" ซึ่งเป็นทางที่เร็วกว่า
    const startLot = wholeRow ? null : lotRow?.product_lot_id ?? null
    const row = startLot ? lotRow : wholeRow

    // ยอดที่ prefill จากแถวเดิมเป็นหน่วยฐานเสมอ — มีแถวเดิมอยู่ก็เปิดที่หน่วยฐาน
    // ไม่งั้นเลข 12 (ซอง) จะไปโผล่ใต้หน่วย "ลัง" แล้วกดบันทึกทับเป็น 12 ลัง
    const unitIndex = scannedUnit && !row
      ? countUnitChoices(product).findIndex((c) => c.unit?.id === scannedUnit.id)
      : -1

    setPicked(product)
    setUnitIdx(unitIndex > 0 ? unitIndex : 0)
    setLotId(startLot)
    setExpiry(row?.expiry_date ?? '')
    setNote(row?.note ?? '')
    setQty(row ? String(row.counted_quantity) : '')
    setTerm('')
    setTimeout(() => {
      panelRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      // สินค้าหลาย lot ที่ยังไม่เคยนับ ให้คนเลือก lot ก่อน จะโฟกัสช่องจำนวนก็ได้อยู่
      if (lots.length <= 1 || row) qtyRef.current?.focus()
    }, 0)
  }

  function switchLot(value: string) {
    if (!picked) return
    const lot = value || null
    const row = findRow(picked.id, lot)
    setLotId(lot)
    setQty(row ? String(row.counted_quantity) : '')
    setExpiry(row?.expiry_date ?? '')
    setNote(row?.note ?? '')
    setTimeout(() => qtyRef.current?.focus(), 0)
  }

  async function savePicked() {
    if (!picked) return
    const n = parseInt(qty, 10)
    if (isNaN(n) || n < 0) {
      toast.error('จำนวนไม่ถูกต้อง')
      return
    }
    const choice = countUnitChoices(picked)[unitIdx]
    const stampable = canStampExpiry(picked, lotId)
    const ok = await queueSave(
      picked,
      lotId,
      n * (choice?.factor ?? 1),
      note.trim() || null,
      stampable ? expiry || null : null
    )
    if (!ok) return
    toast.success(`บันทึก ${picked.name} แล้ว`)
    setPicked(null)
    setQty('')
    setNote('')
    setExpiry('')
    setLotId(null)
  }

  async function editCounted(row: ItemRow, value: string) {
    const n = parseInt(value, 10)
    if (isNaN(n) || n < 0 || n === row.counted_quantity) return
    const product = byId.get(row.product_id)
    if (!product) return
    await queueSave(product, row.product_lot_id, n, row.note, row.expiry_date)
  }

  /**
   * แก้วันหมดอายุของแถวที่นับไว้แล้ว
   *
   * โหมดยิงนับทีละชิ้นไม่ได้เปิดฟอร์มให้กรอก (กล้องค้างไว้ยิงต่อ) — ยิงจบแล้วมากรอกตรงนี้
   * ล้างค่าในช่อง = ไม่เขียนทับวันหมดอายุเดิมใน lot ตอนยืนยัน
   */
  async function editExpiry(row: ItemRow, value: string) {
    const next = value || null
    if (next === row.expiry_date) return
    const product = byId.get(row.product_id)
    if (!product) return
    const ok = await queueSave(product, row.product_lot_id, row.counted_quantity, row.note, next)
    if (ok) toast.success(next ? `${product.name} — หมดอายุ ${fmtDate(next)}` : 'ล้างวันหมดอายุแล้ว')
  }

  async function removeRow(row: ItemRow) {
    const name = byId.get(row.product_id)?.name ?? 'รายการนี้'
    const lot = row.product_lot_id ? lotById.get(row.product_lot_id) : null
    const what = lot ? `${name} (lot ${lot.lot_number || '—'})` : name
    if (!(await confirmDialog({ message: `เอา "${what}" ออกจากรอบนับ?` })).confirmed) return
    const supabase = createClient()
    const { error } = await supabase.from('stock_count_items').delete().eq('id', row.id)
    if (error) {
      toast.error('ลบไม่สำเร็จ: ' + error.message)
      return
    }
    intendedRef.current.delete(keyOf(row.product_id, row.product_lot_id))
    writeRows(rowsRef.current.filter((r) => r.id !== row.id))
  }

  async function post() {
    const withExpiry = rows.filter((r) => r.expiry_date).length
    const { confirmed } = await confirmDialog({
      message:
        `ยืนยันปรับสต็อกตามผลนับ ${summary.items} รายการ?\n` +
        `ขาด ${summary.short} · เกิน ${summary.over} · มูลค่าส่วนต่าง ${fmtBaht(summary.netValue)}\n` +
        (withExpiry > 0 ? `เขียนวันหมดอายุทับของเดิม ${withExpiry} รายการ\n` : '') +
        'สินค้าที่ไม่ได้นับในรอบนี้จะไม่ถูกแตะ',
    })
    if (!confirmed) return

    setPosting(true)
    try {
      const res = await fetch('/api/admin/stock-count/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countId: count.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'ปรับสต็อกไม่สำเร็จ')

      toast.success(`ปรับสต็อกแล้ว ${data.adjusted} รายการ`)
      if (data.expiryStamped > 0) {
        toast.success(`เขียนวันหมดอายุให้ ${data.expiryStamped} lot`, { icon: '📅' })
      }
      if (data.shortfalls?.length > 0) {
        toast(
          `${data.shortfalls.length} รายการลดได้ไม่ครบ เพราะยอดในระบบเหลือน้อยกว่าส่วนต่าง (ขายไประหว่างนับ) — ปรับเป็น 0 ให้แล้ว`,
          { icon: '⚠️', duration: 8000 }
        )
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ปรับสต็อกไม่สำเร็จ')
    } finally {
      setPosting(false)
    }
  }

  async function cancelRound() {
    if (!(await confirmDialog({ message: 'ยกเลิกรอบนับนี้? ผลที่นับไว้จะถูกเก็บไว้แต่จะไม่ปรับสต็อก', tone: 'danger' })).confirmed) return
    const supabase = createClient()
    const { error } = await supabase.from('stock_counts').update({ status: 'cancelled' }).eq('id', count.id)
    if (error) {
      toast.error('ยกเลิกไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success('ยกเลิกรอบนับแล้ว')
    router.refresh()
  }

  const pickedLots = picked ? lotsWithStock(picked) : []
  const pickedLot = lotId ? lotById.get(lotId) : null
  // lot ที่วันหมดอายุจะไปลง — ไว้โชว์ว่าในระบบมีค่าอะไรอยู่ ไม่ได้ prefill ให้
  // เพราะช่องว่าง = ไม่แตะของเดิม ถ้า prefill ไว้ทุกแถวจะกลายเป็นเขียนทับค่าเดิมทุกครั้ง
  const expiryTarget = pickedLot ?? (pickedLots.length === 1 ? pickedLots[0] : null)

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{count.name || 'นับสต็อก'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {count.count_number} · {count.categories?.name ? `เฉพาะหมวด ${count.categories.name}` : 'ทั้งร้าน'}
          </p>
        </div>
        {locked ? (
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${count.status === 'posted' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {count.status === 'posted' ? 'ปรับสต็อกแล้ว' : 'ยกเลิกแล้ว'}
          </span>
        ) : (
          <button onClick={cancelRound} className="text-xs text-gray-400 hover:text-red-500 shrink-0 px-2 py-1">
            ยกเลิกรอบ
          </button>
        )}
      </div>

      {!locked && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 my-4">
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => setScanMode('tally')}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg shrink-0"
            >
              <ScanLine size={16} /> ยิงนับทีละชิ้น
            </button>
            <button
              onClick={() => setScanMode('find')}
              className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg shrink-0"
            >
              <ScanSearch size={16} /> ยิงหาสินค้า
            </button>
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="ค้นชื่อ / SKU / บาร์โค้ด"
                className={`${inputClass} w-full pl-9`}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            ยิงนับทีละชิ้น = ยิงของทุกชิ้น ระบบบวกให้เอง · ยิงหาสินค้า = นับแยกไว้แล้ว ยิงหนึ่งครั้งให้มันเปิดสินค้าตัวนั้นมาให้ แล้วใส่ยอดรวมทีเดียว · วันหมดอายุจากกล่องกรอกที่แถวในตารางได้ทีหลัง
          </p>

          {matches.length > 0 && (
            <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50 mb-3 max-h-64 overflow-y-auto">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => pick(p)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2"
                  >
                    <span className="text-sm text-gray-900 truncate">{p.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      ระบบ {stockOf(p)} {p.unit}
                      {lotsWithStock(p).length > 1 ? ` · ${lotsWithStock(p).length} lot` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {picked && (
            <div ref={panelRef} className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{picked.name}</p>
                  <p className="text-xs text-gray-500">
                    ยอดระบบ {pickedLot ? `${pickedLot.quantity} (lot นี้)` : stockOf(picked)} {picked.unit}
                  </p>
                </div>
                <button onClick={() => setPicked(null)} className="text-gray-400 hover:text-gray-600 p-1 shrink-0">
                  <X size={16} />
                </button>
              </div>

              {/* ตัวเลือก lot โผล่เฉพาะตอนมีของมากกว่าหนึ่ง lot — สินค้าเกือบทั้งร้านมี lot เดียว */}
              {pickedLots.length > 1 && (
                <select value={lotId ?? ''} onChange={(e) => switchLot(e.target.value)} className={`${inputClass} w-full mb-2`}>
                  <option value="">นับรวมทุก lot — {pickedLots.length} lot รวม {stockOf(picked)} {picked.unit}</option>
                  {pickedLots.map((l) => (
                    <option key={l.id} value={l.id}>{lotLabel(l)}</option>
                  ))}
                </select>
              )}

              <div className="flex flex-wrap gap-2">
                <input
                  ref={qtyRef}
                  type="number"
                  min={0}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && savePicked()}
                  placeholder="นับได้"
                  className={`${inputClass} w-24`}
                />
                <select value={unitIdx} onChange={(e) => setUnitIdx(Number(e.target.value))} className={inputClass}>
                  {countUnitChoices(picked).map((c, i) => (
                    <option key={c.unit?.id ?? 'base'} value={i}>
                      {c.name}{c.factor > 1 ? ` (${c.factor} ${picked.unit})` : ''}
                    </option>
                  ))}
                </select>
                {/* วันหมดอายุจากกล่องจริง — ไม่กรอกก็ได้ แต่ของเดิมในระบบว่างอยู่เกือบทั้งร้าน */}
                {canStampExpiry(picked, lotId) && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                    หมดอายุ
                    <DateField
                      value={expiry}
                      onChange={setExpiry}
                      className={`${inputClass} w-36`}
                      aria-label="วันหมดอายุ"
                    />
                  </label>
                )}
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="หมายเหตุ เช่น ของแตก / หมดอายุ"
                  className={`${inputClass} flex-1 min-w-40`}
                />
                <button
                  onClick={savePicked}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  <Check size={15} /> บันทึก
                </button>
              </div>

              {!canStampExpiry(picked, lotId) ? (
                <p className="text-xs text-gray-400 mt-2">
                  มีหลาย lot — เลือก lot ก่อนถ้าจะกรอกวันหมดอายุจากกล่อง
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-2">
                  {expiryTarget?.expiry_date
                    ? `วันหมดอายุในระบบตอนนี้ ${fmtDate(expiryTarget.expiry_date)} — กรอกเฉพาะตอนที่บนกล่องไม่ตรง`
                    : 'ยังไม่มีวันหมดอายุในระบบ — กรอกจากกล่องได้เลย ไม่กรอกก็ได้'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'นับแล้ว', value: `${summary.items} รายการ`, className: 'text-gray-900' },
          { label: 'ขาด', value: `${summary.short} รายการ`, className: 'text-red-600' },
          { label: 'เกิน', value: `${summary.over} รายการ`, className: 'text-green-600' },
          { label: 'มูลค่าส่วนต่าง', value: fmtBaht(summary.netValue), className: summary.netValue < 0 ? 'text-red-600' : 'text-gray-900' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-lg font-semibold ${s.className}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto mb-4">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สินค้า</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ยอดระบบ</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">นับได้</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ส่วนต่าง</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">มูลค่า</th>
              {!locked && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={locked ? 5 : 6} className="px-4 py-10 text-center text-sm text-gray-400">
                  ยังไม่ได้นับอะไรเลย — ยิงบาร์โค้ด หรือค้นชื่อสินค้าแล้วใส่จำนวนเพื่อเริ่ม
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const p = byId.get(r.product_id)
              const lot = r.product_lot_id ? lotById.get(r.product_lot_id) : null
              const diff = varianceOf(r)
              const value = diff * (p?.cost ?? 0)
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900">
                      {p?.name ?? '— สินค้าถูกปิดการขาย —'}
                      {r.product_lot_id && (
                        <span className="ml-2 text-xs text-blue-600">lot {lot?.lot_number || '—'}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {r.counter?.name ? `${r.counter.name} · ` : ''}
                      {new Date(r.counted_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })}
                      {locked && r.expiry_date ? ` · หมดอายุ ${fmtDate(r.expiry_date)}` : ''}
                      {r.note ? ` · ${r.note}` : ''}
                    </p>
                    {/* กรอกวันหมดอายุจากกล่องตรงนี้ได้ — หลาย lot ต้องนับแยก lot ก่อน ไม่งั้นไม่รู้ว่าของ lot ไหน */}
                    {!locked && p && (canStampExpiry(p, r.product_lot_id) ? (
                      <label className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
                        หมดอายุ
                        <DateField
                          value={r.expiry_date ?? ''}
                          onChange={(v) => editExpiry(r, v)}
                          className="w-28 border border-gray-200 rounded-lg px-2 py-0.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          aria-label="วันหมดอายุ"
                        />
                      </label>
                    ) : (
                      <p className="text-xs text-gray-400">
                        {r.expiry_date ? `หมดอายุ ${fmtDate(r.expiry_date)} · ` : ''}มีหลาย lot — นับแยก lot ถ้าจะกรอกวันหมดอายุ
                      </p>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">{r.system_quantity}</td>
                  <td className="px-4 py-3 text-right">
                    {locked ? (
                      <span className="text-sm text-gray-900">{r.counted_quantity}</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        defaultValue={r.counted_quantity}
                        onBlur={(e) => editCounted(r, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-semibold ${diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {diff > 0 ? `+${diff}` : diff}
                    {r.applied_diff != null && r.applied_diff !== diff && (
                      <span className="block text-[10px] font-normal text-amber-600">ปรับจริง {r.applied_diff}</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right ${value < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                    {p?.cost == null ? '—' : fmtBaht(value)}
                  </td>
                  {!locked && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeRow(r)} className="text-gray-300 hover:text-red-500 p-1" title="เอาออกจากรอบนับ">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!locked && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4">
            <button
              onClick={() => setShowRemaining((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm text-gray-700"
            >
              <span>ยังไม่ได้นับ {remaining.length} รายการ{count.categories?.name ? ` ในหมวด ${count.categories.name}` : ''}</span>
              {showRemaining ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
            {showRemaining && (
              <ul className="border-t border-gray-100 divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {remaining.slice(0, 200).map((p) => {
                  const lots = lotsWithStock(p)
                  const done = rows.filter((r) => r.product_id === p.id && r.product_lot_id).length
                  return (
                    <li key={p.id}>
                      <button onClick={() => pick(p)} className="w-full text-left px-5 py-2 hover:bg-gray-50 flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-700 truncate">{p.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">
                          ระบบ {stockOf(p)} {p.unit}
                          {done > 0 ? ` · นับไปแล้ว ${done}/${lots.length} lot` : ''}
                        </span>
                      </button>
                    </li>
                  )
                })}
                {remaining.length > 200 && (
                  <li className="px-5 py-2 text-xs text-gray-400">และอีก {remaining.length - 200} รายการ — ใช้ช่องค้นหาด้านบน</li>
                )}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={post}
              disabled={posting || rows.length === 0}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg"
            >
              <Check size={16} /> {posting ? 'กำลังปรับสต็อก...' : 'ยืนยันปรับสต็อก'}
            </button>
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <AlertTriangle size={13} /> ปรับเฉพาะรายการที่นับในรอบนี้ — สินค้าที่ไม่ได้นับจะไม่ถูกแตะ
            </p>
          </div>
        </>
      )}

      {count.status === 'posted' && (
        <p className="text-xs text-gray-400">
          ปรับสต็อกเรียบร้อยแล้ว — ดูรายการย้อนหลังได้ที่ประวัติสต็อคของสินค้าแต่ละตัว (เหตุผล &ldquo;นับสต็อก {count.count_number}&rdquo;)
        </p>
      )}

      {scanMode && (
        <BarcodeScanner
          onDetect={scanMode === 'find' ? handleFind : handleTally}
          onClose={() => setScanMode(null)}
          title={scanMode === 'find' ? 'ยิงหาสินค้า' : 'ยิงนับทีละชิ้น'}
          hint={
            scanMode === 'find'
              ? 'ยิงหนึ่งครั้ง — จะปิดกล้องแล้วเปิดสินค้าตัวนั้นให้ใส่จำนวนที่นับได้'
              : 'ยิงต่อกันได้เรื่อยๆ ระบบบวกให้ทีละชิ้น · ยิงเกินก็แก้จำนวนที่รายการข้างล่างได้เลย · วันหมดอายุกรอกที่ตารางหลังปิดกล้อง'
          }
          // โหมดหาสินค้ายิงครั้งเดียวแล้วปิดกล้องเลย ไม่ต้องหุบกล้องให้รายการ
          panel={
            scanMode === 'tally' ? (
              <ScanList
                rows={scanRows}
                empty="ยังไม่ได้ยิงอะไร — ที่นับได้จะมาโชว์ที่นี่ แก้จำนวนได้เลย"
                onSetQty={setTallyQty}
                onRemove={removeTallyRow}
                activeKey={lastTallyKey}
              />
            ) : undefined
          }
        />
      )}
    </div>
  )
}
