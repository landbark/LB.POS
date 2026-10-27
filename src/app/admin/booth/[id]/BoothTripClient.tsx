'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/ProgressLink'
import { ArrowLeft, ListPlus, Printer, Store, Tag, Trash2, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/lib/confirm'
import { closeBoothTrip } from '@/lib/closeBoothTrip'
import { boothPrice } from '@/lib/booth'
import { MultiPicker, type ProductOption } from '@/app/admin/receiving/pickers'
import type { BoothTrip, BoothTripItem } from '@/lib/types'

export interface SoldLine {
  quantity: number
  revenue: number
  name: string
  unit: string
  cost: number | null
}

export interface PickerProduct extends ProductOption {
  price: number
  booth_price: number | null
}

/** โปรที่หน้าขายจะลดให้ตอนเปิดโหมดบูธ — อ่านอย่างเดียว แก้ที่หน้าโปรโมชั่น */
export interface BoothPromo {
  id: string
  name: string
  /** เงื่อนไข + ส่วนลดเป็นประโยคเดียว (describePromotion) */
  detail: string
  scope: string
  /** true = เด้งแค่ที่บูธ, false = โปรทุกที่ที่พลอยติดมาด้วย */
  boothOnly: boolean
}

interface Props {
  trip: BoothTrip
  items: BoothTripItem[]
  sold: Record<string, SoldLine>
  products: PickerProduct[]
  promos: BoothPromo[]
  billCount: number
  salesTotal: number
  byMethod: Record<string, number>
  userId: string
  canSeeCost: boolean
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  card: 'บัตรเครดิต',
  qr: 'QR Code',
}

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4865A]/40'
const qtyClass = 'w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#C4865A]/40 disabled:bg-gray-50 disabled:text-gray-500'
const priceClass = 'w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#C4865A]/40'

/** หนึ่งบรรทัดในใบเบิก/ใบคืน พร้อมยอดที่ขายได้จริงของสินค้าตัวนั้น */
interface Line {
  id: string | null      // null = ขายได้แต่ไม่ได้อยู่ในใบเบิก
  productId: string
  name: string
  unit: string
  cost: number | null
  /** ราคาที่ใช้ขายที่บูธจริง = ราคาบูธถ้าตั้งไว้ ไม่งั้นราคาหน้าร้าน */
  price: number
  /** ราคาหน้าร้าน — ไว้โชว์เป็น placeholder ตอนยังไม่ตั้งราคาบูธ */
  listPrice: number
  /** ราคาบูธที่ตั้งไว้ที่ตัวสินค้า (null = ไม่ได้ตั้ง) */
  boothPriceSet: number | null
  /** สินค้ายังอยู่ในระบบ — ถูกลบ/ปิดการขายแล้วแก้ราคาไม่ได้ */
  editable: boolean
  taken: number
  returned: number | null
  sold: number
  revenue: number
}

export default function BoothTripClient({
  trip, items, sold, products, promos, billCount, salesTotal, byMethod, userId, canSeeCost,
}: Props) {
  const router = useRouter()
  const open = trip.status === 'open'
  const [showPicker, setShowPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  // ค่าที่กำลังพิมพ์อยู่ในช่อง (เก็บเป็นข้อความ ลบให้ว่างได้ระหว่างพิมพ์) — บันทึกตอนออกจากช่อง
  const [draft, setDraft] = useState<Record<string, string>>({})

  const [cashCounted, setCashCounted] = useState(trip.cash_counted?.toString() ?? '')
  const [boothFee, setBoothFee] = useState(trip.booth_fee.toString())
  const [travelCost, setTravelCost] = useState(trip.travel_cost.toString())
  const [otherCost, setOtherCost] = useState(trip.other_cost.toString())
  const [otherNote, setOtherNote] = useState(trip.other_cost_note ?? '')
  const [notes, setNotes] = useState(trip.notes ?? '')

  const lines: Line[] = useMemo(() => {
    const rows: Line[] = items.map((it) => {
      const p = it.products
      const s = sold[it.product_id]
      return {
        id: it.id,
        productId: it.product_id,
        name: p?.name ?? s?.name ?? 'ไม่ทราบชื่อ',
        unit: p?.unit ?? s?.unit ?? '',
        cost: p?.cost ?? s?.cost ?? null,
        price: p ? boothPrice(p) : 0,
        listPrice: p?.price ?? 0,
        boothPriceSet: p?.booth_price ?? null,
        editable: p != null,
        taken: it.taken_quantity,
        returned: it.returned_quantity,
        sold: s?.quantity ?? 0,
        revenue: s?.revenue ?? 0,
      }
    })
    // ขายได้แต่ไม่อยู่ในใบเบิก — ต่อท้ายไว้ให้เห็น ไม่งั้นยอดขายกับใบเบิกไม่ตรงกันแล้วงงว่าหายไปไหน
    const listed = new Set(items.map((it) => it.product_id))
    for (const [productId, s] of Object.entries(sold)) {
      if (listed.has(productId)) continue
      rows.push({
        id: null, productId, name: s.name, unit: s.unit, cost: s.cost,
        price: 0, listPrice: 0, boothPriceSet: null, editable: false,
        taken: 0, returned: null, sold: s.quantity, revenue: s.revenue,
      })
    }
    return rows
  }, [items, sold])

  const totals = useMemo(() => {
    let taken = 0, soldQty = 0, returned = 0, missing = 0, missingValue = 0, costOfSold = 0, takenValue = 0
    for (const l of lines) {
      taken += l.taken
      soldQty += l.sold
      returned += l.returned ?? 0
      const gap = l.returned == null ? 0 : Math.max(0, l.taken - l.sold - l.returned)
      missing += gap
      missingValue += gap * (l.cost ?? 0)
      costOfSold += l.sold * (l.cost ?? 0)
      takenValue += l.taken * l.price
    }
    return { taken, soldQty, returned, missing, missingValue, costOfSold, takenValue }
  }, [lines])

  const expenses = Number(boothFee || 0) + Number(travelCost || 0) + Number(otherCost || 0)
  const grossProfit = salesTotal - totals.costOfSold - expenses - totals.missingValue
  const cashSales = byMethod.cash ?? 0
  const expectedCash = trip.float_cash + cashSales
  const countedNum = cashCounted.trim() ? parseFloat(cashCounted) : null
  const notReturnedYet = lines.filter((l) => l.id && l.returned == null).length

  /** แก้จำนวนในใบเบิก/ใบคืน — บันทึกตอนออกจากช่อง ไม่ยิงทุกตัวอักษร */
  async function saveQty(line: Line, field: 'taken_quantity' | 'returned_quantity', raw: string) {
    if (!line.id) return
    const key = `${line.id}:${field}`
    setDraft((d) => { const next = { ...d }; delete next[key]; return next })

    const text = raw.trim()
    const value = text === '' ? null : parseInt(text, 10)
    if (value !== null && (!isFinite(value) || value < 0)) {
      toast.error('ใส่เป็นจำนวนเต็มไม่ติดลบ')
      return
    }
    if (field === 'taken_quantity' && (value === null || value === 0)) {
      toast.error('จำนวนที่เบิกต้องมากกว่า 0 — ถ้าไม่ได้เอาไปให้ลบแถวทิ้ง')
      return
    }
    const current = field === 'taken_quantity' ? line.taken : line.returned
    if (value === current) return

    const supabase = createClient()
    const { error } = await supabase.from('booth_trip_items').update({ [field]: value }).eq('id', line.id)
    if (error) toast.error('บันทึกไม่สำเร็จ: ' + error.message)
    router.refresh()
  }

  /**
   * แก้ราคาบูธจากใบเบิก — ค่าไปลงที่ **ตัวสินค้า** (products.booth_price) ไม่ใช่ที่รอบนี้
   * เพราะหน้าขายโหมดบูธอ่านราคาจากสินค้า จึงมีผลกับรอบอื่นที่ใช้สินค้าตัวเดียวกันด้วย
   *
   * ปล่อยว่าง = ไม่ตั้งราคาบูธ กลับไปขายราคาหน้าร้าน
   */
  async function saveBoothPrice(line: Line, raw: string) {
    if (!line.id || !line.editable) return
    const key = `${line.id}:booth_price`
    setDraft((d) => { const next = { ...d }; delete next[key]; return next })

    const text = raw.trim()
    const value = text === '' ? null : parseFloat(text)
    if (value !== null && (!isFinite(value) || value < 0)) {
      toast.error('ราคาต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    if (value === line.boothPriceSet) return

    const supabase = createClient()
    const { error } = await supabase.from('products').update({ booth_price: value }).eq('id', line.productId)
    if (error) {
      toast.error('บันทึกราคาบูธไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success(value == null ? `${line.name} — กลับไปใช้ราคาหน้าร้าน` : `${line.name} — ราคาบูธ ฿${money(value)}`)
    router.refresh()
  }

  async function addProducts(ids: string[]) {
    setShowPicker(false)
    if (ids.length === 0) return
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('booth_trip_items').insert(
      ids.map((product_id) => ({ trip_id: trip.id, product_id, taken_quantity: 1 })),
    )
    setBusy(false)
    if (error) {
      toast.error('เพิ่มสินค้าไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success(`เพิ่ม ${ids.length} รายการ — ใส่จำนวนที่เอาไปได้เลย`)
    router.refresh()
  }

  async function removeLine(line: Line) {
    if (!line.id) return
    if (line.sold > 0) {
      toast.error('ลบไม่ได้ — สินค้าตัวนี้ขายไปแล้วในรอบนี้')
      return
    }
    const { confirmed } = await confirmDialog({
      title: 'เอาออกจากใบเบิก?',
      message: `${line.name} จะถูกลบออกจากรายการของที่ยกไป`,
      confirmLabel: 'เอาออก',
      tone: 'danger',
    })
    if (!confirmed) return
    const supabase = createClient()
    const { error } = await supabase.from('booth_trip_items').delete().eq('id', line.id)
    if (error) toast.error('ลบไม่สำเร็จ: ' + error.message)
    router.refresh()
  }

  /** เขียนค่าใช้จ่าย/เงินที่นับได้ลง DB — ใช้ทั้งปุ่มบันทึกและก่อนปิดรอบ */
  async function persistFields(): Promise<string | null> {
    const supabase = createClient()
    const { error } = await supabase
      .from('booth_trips')
      .update({
        booth_fee: Number(boothFee || 0),
        travel_cost: Number(travelCost || 0),
        other_cost: Number(otherCost || 0),
        other_cost_note: otherNote.trim() || null,
        notes: notes.trim() || null,
        cash_counted: countedNum,
      })
      .eq('id', trip.id)
    return error?.message ?? null
  }

  async function saveTripFields() {
    setBusy(true)
    const error = await persistFields()
    setBusy(false)
    if (error) {
      toast.error('บันทึกไม่สำเร็จ: ' + error)
      return
    }
    toast.success('บันทึกแล้ว')
    router.refresh()
  }

  async function close() {
    const missingLines = lines
      .filter((l) => l.returned != null)
      .map((l) => ({ product_id: l.productId, quantity: Math.max(0, l.taken - l.sold - l.returned!) }))
      .filter((m) => m.quantity > 0)

    const warn = notReturnedYet > 0
      ? `\n\nยังไม่ได้กรอกใบคืนอีก ${notReturnedYet} รายการ — ของพวกนี้จะไม่ถูกตัดเป็นของหาย`
      : ''
    const lost = missingLines.length > 0
      ? `ของหาย ${totals.missing} ชิ้น จาก ${missingLines.length} รายการ จะถูกตัดออกจากสต็อก`
      : 'ของกลับครบ ไม่มีอะไรต้องตัดออกจากสต็อก'

    const { confirmed } = await confirmDialog({
      title: 'ปิดรอบออกบูธ?',
      message: `${lost}${warn}\n\nปิดแล้วจะขายในโหมดบูธต่อไม่ได้ และแก้ใบเบิก/ใบคืนไม่ได้อีก`,
      confirmLabel: 'ปิดรอบ',
      tone: 'primary',
    })
    if (!confirmed) return

    setBusy(true)
    const supabase = createClient()
    // ค่าใช้จ่าย/เงินที่นับได้ที่พิมพ์ค้างไว้ ต้องลงไปก่อน ไม่งั้นหายตอนปิด
    const saveError = await persistFields()
    if (saveError) {
      setBusy(false)
      toast.error('บันทึกค่าใช้จ่ายไม่สำเร็จ ยังไม่ปิดรอบ: ' + saveError)
      return
    }
    const { error } = await closeBoothTrip(supabase, {
      tripId: trip.id,
      tripNumber: trip.trip_number,
      missing: missingLines,
      cashCounted: countedNum,
      closedBy: userId || null,
    })
    setBusy(false)
    if (error) {
      toast.error(error)
      router.refresh()
      return
    }
    toast.success('ปิดรอบแล้ว')
    router.refresh()
  }

  const alreadyPicked = new Set(items.map((it) => it.product_id))

  return (
    <div className="max-w-5xl">
      <Link href="/admin/booth" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} /> กลับไปรายการรอบ
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Store size={22} className="text-[#C4865A]" />
            {trip.name || 'งานออกบูธ'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date(trip.trip_date).toLocaleDateString('th-TH', { dateStyle: 'long' })}
            {trip.location && ` · ${trip.location}`} · เลขที่ {trip.trip_number}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${
            open ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
          }`}>
            {open ? 'กำลังขาย' : 'ปิดรอบแล้ว'}
          </span>
          <Link
            href={`/print/booth/${trip.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Printer size={15} /> พิมพ์ใบเบิก/ใบคืน
          </Link>
        </div>
      </div>

      {open && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          เปิด <span className="font-semibold">หน้าขาย</span> บนเครื่องที่เอาไปงาน แล้วกดสวิตช์
          &quot;โหมดบูธ&quot; ด้านบน — ราคาจะสลับเป็นราคาบูธ และหน้าขายจะโชว์เฉพาะของในใบเบิกนี้
        </div>
      )}

      {/* ───────── โปรที่ใช้ที่บูธ — อ่านอย่างเดียว ไม่ได้ผูกกับรอบ ใช้ซ้ำได้ทุกงาน ───────── */}
      {open && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Tag size={16} className="text-[#C4865A]" /> โปรโมชั่นที่ใช้ที่งานนี้
              </h2>
              <p className="text-xs text-gray-500">
                หน้าขายจะลดให้เองตอนเปิดโหมดบูธ — ตั้งไว้ครั้งเดียวใช้ได้ทุกรอบ ไม่ผูกกับงานนี้
              </p>
            </div>
            <Link
              href="/admin/promotions"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Tag size={15} /> จัดการโปรโมชั่น
            </Link>
          </div>
          {promos.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              ยังไม่มีโปรที่ใช้ได้ที่งานนี้ — ไปที่หน้าโปรโมชั่นแล้วตั้ง &quot;ใช้ที่ไหน&quot; เป็นงานออกบูธ
            </p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {promos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="font-medium text-sm text-gray-900">{p.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.boothOnly ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {p.boothOnly ? 'เฉพาะออกบูธ' : 'ทุกที่'}
                  </span>
                  <span className="text-sm text-gray-600">{p.detail}</span>
                  <span className="text-xs text-gray-400">· {p.scope}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ───────── ใบเบิก / ใบคืน ───────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="font-semibold text-gray-900">ใบเบิก / ใบคืน</h2>
            <p className="text-xs text-gray-500">
              ของที่ยกไปยังไม่ถูกตัดสต็อก — ตัดตอนขายเหมือนหน้าร้าน ส่วนที่หายตัดตอนปิดรอบ
              {open && ' · ราคาบูธแก้ที่นี่ได้ ค่าไปลงที่ตัวสินค้า (มีผลกับรอบอื่นด้วย)'}
            </p>
          </div>
          {open && (
            <button
              onClick={() => setShowPicker(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C4865A] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#b0754c] disabled:opacity-50"
            >
              <ListPlus size={15} /> เพิ่มสินค้า
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">สินค้า</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-2.5">ราคาบูธ</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-2.5">เอาไป</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-2.5">ขายได้</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-2.5">ควรเหลือ</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-2.5">คืน</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-2.5">หาย</th>
                {open && <th className="px-3 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map((l) => {
                const should = l.taken - l.sold
                const gap = l.returned == null ? null : Math.max(0, should - l.returned)
                const takenKey = `${l.id}:taken_quantity`
                const returnedKey = `${l.id}:returned_quantity`
                const priceKey = `${l.id}:booth_price`
                return (
                  <tr key={l.id ?? l.productId} className={l.id ? '' : 'bg-orange-50/50'}>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {l.name}
                      {!l.id && (
                        <span className="block text-xs text-orange-700">ขายได้แต่ไม่อยู่ในใบเบิก</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.id && open && l.editable ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={money(l.listPrice)}
                            className={priceClass}
                            value={draft[priceKey] ?? (l.boothPriceSet == null ? '' : String(l.boothPriceSet))}
                            onChange={(e) => setDraft((d) => ({ ...d, [priceKey]: e.target.value }))}
                            onBlur={(e) => saveBoothPrice(l, e.target.value)}
                          />
                          {l.boothPriceSet == null && (
                            <span className="block text-[10px] text-gray-400">ราคาหน้าร้าน</span>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-gray-500">{l.id ? `฿${money(l.price)}` : '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.id && open ? (
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className={qtyClass}
                          value={draft[takenKey] ?? String(l.taken)}
                          onChange={(e) => setDraft((d) => ({ ...d, [takenKey]: e.target.value }))}
                          onBlur={(e) => saveQty(l, 'taken_quantity', e.target.value)}
                        />
                      ) : (
                        <span className="text-sm text-gray-700">{l.id ? l.taken : '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-right text-gray-700">{l.sold}</td>
                    <td className="px-3 py-2 text-sm text-right text-gray-500">{l.id ? should : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {l.id && open ? (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="—"
                          className={qtyClass}
                          value={draft[returnedKey] ?? (l.returned == null ? '' : String(l.returned))}
                          onChange={(e) => setDraft((d) => ({ ...d, [returnedKey]: e.target.value }))}
                          onBlur={(e) => saveQty(l, 'returned_quantity', e.target.value)}
                        />
                      ) : (
                        <span className="text-sm text-gray-700">{l.returned ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-right">
                      {gap == null ? (
                        <span className="text-gray-300">—</span>
                      ) : gap > 0 ? (
                        <span className="font-semibold text-red-600">{gap}</span>
                      ) : (
                        <span className="text-green-600">0</span>
                      )}
                    </td>
                    {open && (
                      <td className="px-3 py-2 text-right">
                        {l.id && (
                          <button
                            onClick={() => removeLine(l)}
                            title="เอาออกจากใบเบิก"
                            className="p-1 text-gray-300 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={open ? 8 : 7} className="px-4 py-10 text-center text-sm text-gray-400">
                    ยังไม่มีของในใบเบิก — กด &quot;เพิ่มสินค้า&quot; เพื่อลงรายการที่จะยกไป
                  </td>
                </tr>
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-100">
                <tr className="text-sm font-semibold text-gray-700">
                  <td className="px-4 py-2.5">รวม</td>
                  <td className="px-3 py-2.5 text-right">฿{money(totals.takenValue)}</td>
                  <td className="px-3 py-2.5 text-right">{totals.taken}</td>
                  <td className="px-3 py-2.5 text-right">{totals.soldQty}</td>
                  <td className="px-3 py-2.5 text-right text-gray-400">{totals.taken - totals.soldQty}</td>
                  <td className="px-3 py-2.5 text-right">{totals.returned}</td>
                  <td className={`px-3 py-2.5 text-right ${totals.missing > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {totals.missing}
                  </td>
                  {open && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ───────── สรุปรอบ ───────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">ยอดขายรอบนี้</h2>
          <p className="text-3xl font-bold text-gray-900">฿{money(salesTotal)}</p>
          <p className="text-sm text-gray-500">{billCount} บิล</p>

          <div className="mt-4 space-y-1.5 text-sm">
            {Object.entries(byMethod).map(([method, amount]) => (
              <div key={method} className="flex justify-between text-gray-600">
                <span>{METHOD_LABELS[method] ?? method}</span>
                <span className="font-medium text-gray-900">฿{money(amount)}</span>
              </div>
            ))}
            {Object.keys(byMethod).length === 0 && (
              <p className="text-gray-400">ยังไม่มีบิลในรอบนี้</p>
            )}
          </div>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">เงินสด (แยกจากเก๊ะที่ร้าน)</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>เงินทอนที่เตรียมไป</span><span>฿{money(trip.float_cash)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>ขายเป็นเงินสด</span><span>฿{money(cashSales)}</span>
              </div>
              <div className="flex justify-between font-medium text-gray-900">
                <span>ควรมีเงินสด</span><span>฿{money(expectedCash)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-gray-600">นับได้จริง</span>
                <input
                  type="number"
                  step="0.01"
                  value={cashCounted}
                  onChange={(e) => setCashCounted(e.target.value)}
                  disabled={!open}
                  className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right disabled:bg-gray-50"
                  placeholder="—"
                />
              </div>
              {countedNum != null && (
                <div className={`flex justify-between font-semibold ${
                  Math.abs(countedNum - expectedCash) < 0.005 ? 'text-green-600'
                    : countedNum < expectedCash ? 'text-red-600' : 'text-amber-600'
                }`}>
                  <span>ส่วนต่าง</span>
                  <span>{countedNum - expectedCash >= 0 ? '+' : '−'}฿{money(Math.abs(countedNum - expectedCash))}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">ค่าใช้จ่ายของรอบนี้</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">ค่าบูธ</label>
                <input type="number" min="0" step="0.01" value={boothFee} onChange={(e) => setBoothFee(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">ค่าเดินทาง</label>
                <input type="number" min="0" step="0.01" value={travelCost} onChange={(e) => setTravelCost(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">อื่นๆ</label>
                <input type="number" min="0" step="0.01" value={otherCost} onChange={(e) => setOtherCost(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">อื่นๆ คือค่าอะไร</label>
                <input value={otherNote} onChange={(e) => setOtherNote(e.target.value)} className={inputClass} placeholder="เช่น ค่าน้ำแข็ง" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">บันทึกเพิ่มเติม</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} placeholder="เช่น ฝนตกช่วงบ่าย คนน้อย" />
            </div>
            <button
              onClick={saveTripFields}
              disabled={busy}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              บันทึกค่าใช้จ่าย
            </button>
          </div>

          {canSeeCost && (
            <div className="mt-5 border-t border-gray-100 pt-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>ยอดขาย</span><span>฿{money(salesTotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>− ต้นทุนของที่ขายได้</span><span>฿{money(totals.costOfSold)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>− ค่าใช้จ่ายรอบนี้</span><span>฿{money(expenses)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>− ต้นทุนของที่หาย</span><span>฿{money(totals.missingValue)}</span>
              </div>
              <div className={`flex justify-between border-t border-gray-100 pt-2 text-base font-bold ${
                grossProfit >= 0 ? 'text-green-700' : 'text-red-600'
              }`}>
                <span>เหลือ</span><span>฿{money(grossProfit)}</span>
              </div>
              <p className="text-xs text-gray-400 pt-1">
                ต้นทุนคิดจากราคาทุนที่ตั้งไว้ในสินค้า — ตัวไหนไม่ได้กรอกทุนจะนับเป็น 0
              </p>
            </div>
          )}
        </div>
      </div>

      {open ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">ปิดรอบ</h2>
          <p className="mt-1 text-sm text-gray-500">
            กรอกใบคืนให้ครบก่อน — ส่วนที่หาย ({totals.missing} ชิ้น) จะถูกตัดออกจากสต็อกเป็น
            &quot;ของหายจากงานออกบูธ&quot; แล้วรอบนี้จะแก้ไม่ได้อีก
          </p>
          {notReturnedYet > 0 && (
            <p className="mt-2 text-sm font-medium text-amber-700">
              ยังไม่ได้กรอกช่อง &quot;คืน&quot; อีก {notReturnedYet} รายการ
            </p>
          )}
          <button
            onClick={close}
            disabled={busy}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#7A4E2D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#633d22] disabled:opacity-50"
          >
            <Lock size={15} /> ปิดรอบและตัดของหาย
          </button>
        </div>
      ) : (
        <p className="mt-6 text-sm text-gray-500">
          ปิดรอบเมื่อ {trip.closed_at && new Date(trip.closed_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
          {trip.closer?.name && ` โดย ${trip.closer.name}`}
        </p>
      )}

      {showPicker && (
        <MultiPicker
          products={products}
          supplierId=""
          supplierName=""
          alreadyPicked={alreadyPicked}
          onAdd={addProducts}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
