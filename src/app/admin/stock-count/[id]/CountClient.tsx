'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ScanLine, Search, Trash2, Check, X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import BarcodeScanner, { type ScanFeedback } from '@/components/BarcodeScanner'
import { confirmDialog } from '@/lib/confirm'
import { findByBarcode } from '@/lib/productUnits'
import { countUnitChoices, stockOf, summarize, varianceOf, type CountableProduct } from '@/lib/stockCount'
import type { StockCount } from '@/lib/types'

interface ItemRow {
  id: string
  product_id: string
  counted_quantity: number
  system_quantity: number
  applied_diff: number | null
  note: string | null
  counted_at: string
  counter: { name: string | null } | null
}

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const fmtBaht = (n: number) => `${n < 0 ? '-' : ''}฿${Math.abs(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`

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
  const [showScanner, setShowScanner] = useState(false)
  const [term, setTerm] = useState('')
  const [picked, setPicked] = useState<CountableProduct | null>(null)
  const [qty, setQty] = useState('')
  const [unitIdx, setUnitIdx] = useState(0)
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)
  const [showRemaining, setShowRemaining] = useState(false)
  const qtyRef = useRef<HTMLInputElement>(null)

  const locked = count.status !== 'counting'
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  // สินค้าในขอบเขตของรอบนี้ — ไว้บอกว่ายังเหลืออะไรยังไม่นับ
  const inScope = useMemo(
    () => (count.category_id ? products.filter((p) => p.category_id === count.category_id) : products),
    [products, count.category_id]
  )

  const summary = useMemo(
    () => summarize(rows.map((r) => ({ ...r, cost: byId.get(r.product_id)?.cost ?? null }))),
    [rows, byId]
  )

  const countedIds = useMemo(() => new Set(rows.map((r) => r.product_id)), [rows])
  const remaining = useMemo(() => inScope.filter((p) => !countedIds.has(p.id)), [inScope, countedIds])

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

  /** เขียนผลการนับของสินค้าหนึ่งตัว (นับซ้ำ = ทับของเดิม) */
  async function saveCount(product: CountableProduct, counted: number, rowNote: string | null) {
    const existing = rows.find((r) => r.product_id === product.id)
    // ยอดระบบล็อกไว้ตั้งแต่ครั้งแรกที่นับตัวนี้ — นับซ้ำ/แก้ตัวเลขไม่ควรเลื่อนฐานเทียบตาม
    const system = existing?.system_quantity ?? stockOf(product)
    const countedAt = new Date().toISOString()

    const supabase = createClient()
    const { data, error } = await supabase
      .from('stock_count_items')
      .upsert(
        {
          count_id: count.id,
          product_id: product.id,
          counted_quantity: counted,
          system_quantity: system,
          note: rowNote,
          counted_by: userId || null,
          counted_at: countedAt,
        },
        { onConflict: 'count_id,product_id' }
      )
      .select('id')
      .single()

    if (error || !data) {
      toast.error('บันทึกไม่สำเร็จ: ' + (error?.message ?? ''))
      return false
    }

    setRows((prev) => {
      const row: ItemRow = {
        id: data.id,
        product_id: product.id,
        counted_quantity: counted,
        system_quantity: system,
        applied_diff: null,
        note: rowNote,
        counted_at: countedAt,
        counter: existing?.counter ?? null,
      }
      const rest = prev.filter((r) => r.product_id !== product.id)
      return [row, ...rest]
    })
    return true
  }

  /** ยิงบาร์โค้ด = บวกทีละชิ้น (ยิงลัง = บวกทั้งลัง) นับของบนชั้นได้โดยไม่ต้องพิมพ์ */
  function handleScan(code: string): ScanFeedback {
    if (locked) return { ok: false, message: 'รอบนี้ปิดแล้ว' }

    const hit = findByBarcode(products, code)
    const bySku = hit ?? (() => {
      const lower = code.trim().toLowerCase()
      const p = products.find((x) => x.sku?.toLowerCase() === lower)
      return p ? { product: p, unit: null } : null
    })()

    if (!bySku) return { ok: false, message: `ไม่พบสินค้าจากรหัส ${code}` }

    const { product, unit } = bySku
    const step = unit?.factor ?? 1
    const current = rows.find((r) => r.product_id === product.id)?.counted_quantity ?? 0
    const next = current + step

    void saveCount(product, next, null)
    return { ok: true, message: `${product.name} — นับได้ ${next} ${product.unit}` }
  }

  function pick(product: CountableProduct) {
    setPicked(product)
    setUnitIdx(0)
    setNote('')
    const current = rows.find((r) => r.product_id === product.id)
    setQty(current ? String(current.counted_quantity) : '')
    setTerm('')
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
    const ok = await saveCount(picked, n * (choice?.factor ?? 1), note.trim() || null)
    if (!ok) return
    toast.success(`บันทึก ${picked.name} แล้ว`)
    setPicked(null)
    setQty('')
    setNote('')
  }

  async function editCounted(row: ItemRow, value: string) {
    const n = parseInt(value, 10)
    if (isNaN(n) || n < 0 || n === row.counted_quantity) return
    const product = byId.get(row.product_id)
    if (!product) return
    await saveCount(product, n, row.note)
  }

  async function removeRow(row: ItemRow) {
    const name = byId.get(row.product_id)?.name ?? 'รายการนี้'
    if (!(await confirmDialog({ message: `เอา "${name}" ออกจากรอบนับ?` })).confirmed) return
    const supabase = createClient()
    const { error } = await supabase.from('stock_count_items').delete().eq('id', row.id)
    if (error) {
      toast.error('ลบไม่สำเร็จ: ' + error.message)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
  }

  async function post() {
    const { confirmed } = await confirmDialog({
      message:
        `ยืนยันปรับสต็อกตามผลนับ ${summary.items} รายการ?\n` +
        `ขาด ${summary.short} · เกิน ${summary.over} · มูลค่าส่วนต่าง ${fmtBaht(summary.netValue)}\n` +
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
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg shrink-0"
            >
              <ScanLine size={16} /> ยิงบาร์โค้ด
            </button>
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="ค้นชื่อ / SKU / บาร์โค้ด"
                className={`${inputClass} w-full pl-9`}
              />
            </div>
          </div>

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
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {picked && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{picked.name}</p>
                  <p className="text-xs text-gray-500">ยอดระบบ {stockOf(picked)} {picked.unit}</p>
                </div>
                <button onClick={() => setPicked(null)} className="text-gray-400 hover:text-gray-600 p-1 shrink-0">
                  <X size={16} />
                </button>
              </div>
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
                  ยังไม่ได้นับอะไรเลย — ยิงบาร์โค้ดหรือค้นชื่อสินค้าเพื่อเริ่ม
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const p = byId.get(r.product_id)
              const diff = varianceOf(r)
              const value = diff * (p?.cost ?? 0)
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900">{p?.name ?? '— สินค้าถูกปิดการขาย —'}</p>
                    <p className="text-xs text-gray-400">
                      {r.counter?.name ? `${r.counter.name} · ` : ''}
                      {new Date(r.counted_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })}
                      {r.note ? ` · ${r.note}` : ''}
                    </p>
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
                {remaining.slice(0, 200).map((p) => (
                  <li key={p.id}>
                    <button onClick={() => pick(p)} className="w-full text-left px-5 py-2 hover:bg-gray-50 flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-700 truncate">{p.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">ระบบ {stockOf(p)} {p.unit}</span>
                    </button>
                  </li>
                ))}
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

      {showScanner && <BarcodeScanner onDetect={handleScan} onClose={() => setShowScanner(false)} />}
    </div>
  )
}
