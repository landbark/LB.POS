'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { X, Search, Plus, Minus, Trash2, RotateCcw, Printer, CheckCircle2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { POS_PRODUCT_SELECT } from '@/lib/clinicQueue'
import { PAYMENT_LABEL } from '@/lib/payments'
import { isClinicOnly } from '@/lib/clinic'
import {
  createReturn,
  loadReturnableBill,
  quoteReturn,
  settleAmounts,
  type CreateReturnResult,
  type ReturnableBill,
} from '@/lib/returns'
import type { CartItem, PaymentMethod, PointsConfig, Product, RefundMethod } from '@/lib/types'

/**
 * รับคืน / เปลี่ยนสินค้าบางรายการ — จอเดียวจบ
 *
 * ใช้ได้ทั้งจากหน้าขาย (ลูกค้ายืนอยู่ตรงหน้า) และจากทะเบียนใบเสร็จ (ตามเรื่องย้อนหลัง)
 * สิ่งที่จอนี้ทำให้ครบในครั้งเดียว: เลือกรายการที่รับคืน → คืนของเข้าสต็อก → เลือกสินค้าใหม่
 * ที่เอาไปแทน → เก็บเงินส่วนต่าง หรือคืนเงินส่วนที่เหลือ (เงินสด/โอน/เครดิต)
 *
 * บิลเดิมไม่ถูกแตะเลย — ยอดขายของวันที่ขายจึงไม่ขยับ และ VAT ของเดือนนั้นไม่เปลี่ยนย้อนหลัง
 * ซึ่งเป็นข้อเสียใหญ่ของการ "ยกเลิกใบเสร็จทั้งใบแล้วขายใหม่"
 */

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const METHODS: PaymentMethod[] = ['cash', 'transfer', 'qr', 'card']
const REFUND_OPTIONS: { value: RefundMethod; label: string }[] = [
  { value: 'cash', label: 'เงินสด' },
  { value: 'transfer', label: 'โอนเงิน' },
  { value: 'credit', label: 'เก็บเป็นเครดิตร้าน' },
]

export interface ReturnModalProps {
  currentUserId: string
  /** เปิดมาจากทะเบียนใบเสร็จ = รู้บิลอยู่แล้ว ไม่ต้องให้ค้นหา */
  initialBillId?: string | null
  onClose: () => void
  /** เรียกหลังบันทึกสำเร็จและผู้ใช้กดปิด — ให้หน้าที่เรียกไป refresh ตัวเอง */
  onDone?: (result: CreateReturnResult) => void
}

export default function ReturnModal({ currentUserId, initialBillId, onClose, onDone }: ReturnModalProps) {
  const [lookup, setLookup] = useState('')
  const [bill, setBill] = useState<ReturnableBill | null>(null)
  const [loadingBill, setLoadingBill] = useState(false)
  const [billError, setBillError] = useState<string | null>(null)

  const [qty, setQty] = useState<Record<string, number>>({})
  const [restock, setRestock] = useState(true)
  const [reason, setReason] = useState('')

  const [newItems, setNewItems] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)

  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash')
  const [pointsConfig, setPointsConfig] = useState<PointsConfig | null>(null)

  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<CreateReturnResult | null>(null)

  const fetchBill = useCallback(async (key: string) => {
    setLoadingBill(true)
    setBillError(null)
    const { bill: found, error } = await loadReturnableBill(createClient(), key)
    setLoadingBill(false)
    if (error || !found) {
      setBillError(error ?? 'ไม่พบบิล')
      setBill(null)
      return
    }
    setBill(found)
    setQty({})
  }, [])

  // เปิดมาจากทะเบียนใบเสร็จ — โหลดบิลนั้นให้เลย
  useEffect(() => {
    if (!initialBillId) return
    let cancelled = false
    loadReturnableBill(createClient(), initialBillId).then(({ bill: found, error }) => {
      if (cancelled) return
      if (error || !found) {
        setBillError(error ?? 'ไม่พบบิล')
        return
      }
      setBill(found)
      setQty({})
    })
    return () => {
      cancelled = true
    }
  }, [initialBillId])

  // ตั้งค่าแต้ม — บิลเปลี่ยนสินค้าให้แต้มตามเงินที่จ่ายเพิ่ม เหมือนขายปกติ
  useEffect(() => {
    createClient()
      .from('points_config')
      .select('*')
      .limit(1)
      .single()
      .then(({ data }) => setPointsConfig(data?.enabled === false ? null : (data as PointsConfig | null)))
  }, [])

  // ค้นสินค้าที่จะเอาไปแทน — ถามทีละคำค้น ไม่โหลดสินค้าทั้งร้านมาเก็บในจอนี้
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const q = search.trim().replace(/[,()%]/g, ' ').trim()
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      if (q.length < 2) {
        setResults([])
        return
      }
      setSearching(true)
      const { data } = await createClient()
        .from('products')
        .select(POS_PRODUCT_SELECT)
        .eq('active', true)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
        .order('name')
        .limit(20)
      setSearching(false)
      // ยา/เวชภัณฑ์ไม่ขายหน้าร้าน — หมอสั่งจ่ายจากหน้าตรวจรักษา (กฎเดียวกับหน้าขาย)
      setResults(((data ?? []) as unknown as Product[]).filter((p) => !isClinicOnly(p)))
    }, q.length < 2 ? 0 : 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [search])

  const selection = useMemo(
    () => Object.entries(qty).filter(([, q]) => q > 0).map(([itemId, q]) => ({ itemId, quantity: q })),
    [qty],
  )
  const quote = useMemo(() => (bill ? quoteReturn(bill, selection) : null), [bill, selection])
  const exchangeGross = useMemo(() => newItems.reduce((s, i) => s + i.subtotal, 0), [newItems])
  const settle = useMemo(
    () => settleAmounts(quote?.returnValue ?? 0, exchangeGross),
    [quote?.returnValue, exchangeGross],
  )

  const needsRefundMethod = settle.refundAmount > 0.005
  const creditBlocked = needsRefundMethod && refundMethod === 'credit' && !bill?.customer_id
  const cashShort = settle.extraPaid > 0 && method === 'cash' && cashReceived !== ''
    ? parseFloat(cashReceived || '0') - settle.extraPaid
    : 0

  function setItemQty(itemId: string, next: number, max: number) {
    setQty((prev) => {
      const clamped = Math.max(0, Math.min(next, max))
      if (clamped === 0) {
        const rest = { ...prev }
        delete rest[itemId]
        return rest
      }
      return { ...prev, [itemId]: clamped }
    })
  }

  function addNewItem(p: Product) {
    setNewItems((prev) => {
      const at = prev.findIndex((i) => i.product.id === p.id)
      if (at >= 0) {
        const copy = [...prev]
        const item = copy[at]
        copy[at] = { ...item, quantity: item.quantity + 1, subtotal: item.unit_price * (item.quantity + 1) }
        return copy
      }
      return [
        ...prev,
        {
          product: p,
          unit: null,
          quantity: 1,
          unit_price: p.price,
          discount: 0,
          manual_discount: 0,
          discount_mode: 'amount' as const,
          discount_value: 0,
          subtotal: p.price,
          lot_id: null,
        },
      ]
    })
    setSearch('')
    setResults([])
  }

  function setNewQty(productId: string, next: number) {
    setNewItems((prev) =>
      prev
        .map((i) =>
          i.product.id === productId
            ? { ...i, quantity: Math.max(0, next), subtotal: i.unit_price * Math.max(0, next) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    )
  }

  async function submit() {
    if (!bill || !quote) return
    if (quote.lines.length === 0) {
      toast.error('เลือกรายการที่รับคืนก่อน')
      return
    }
    if (creditBlocked) {
      toast.error('บิลนี้ไม่มีลูกค้าสมาชิก — เก็บเป็นเครดิตไม่ได้')
      return
    }

    setSaving(true)
    const { error, result } = await createReturn(createClient(), {
      bill,
      selection,
      restock,
      reason,
      createdBy: currentUserId,
      exchangeCart: newItems,
      paymentMethod: method,
      cashReceived: method === 'cash' && cashReceived ? parseFloat(cashReceived) : null,
      refundMethod: needsRefundMethod ? refundMethod : null,
      pointsConfig,
    })
    setSaving(false)

    if (error || !result) {
      toast.error(error ?? 'บันทึกไม่สำเร็จ', { duration: 10000 })
      return
    }

    // แจ้งเตือน Telegram + กระดิ่งในระบบ — งานเสริม ล้มเหลวไม่ให้กระทบใบคืนที่บันทึกแล้ว
    fetch('/api/notify/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnId: result.returnId }),
    }).catch(() => {})

    setDone(result)
  }

  // ── จอสรุปหลังบันทึกสำเร็จ ─────────────────────────────────────────────────
  if (done) {
    return (
      <Shell onClose={() => { onDone?.(done); onClose() }} title={`บันทึกแล้ว · ${done.returnNumber}`}>
        <div className="p-6 text-center">
          <CheckCircle2 size={44} className="mx-auto text-green-500 mb-3" />
          <p className="font-semibold text-gray-900 mb-1">
            {done.exchangeNumber ? 'เปลี่ยนสินค้าเรียบร้อย' : 'รับคืนสินค้าเรียบร้อย'}
          </p>
          <div className="text-sm text-gray-600 space-y-1 mt-3 mb-5 inline-block text-left">
            <p>มูลค่าที่รับคืน <strong className="tabular-nums">฿{money(done.returnValue)}</strong></p>
            {done.offsetAmount > 0 && (
              <p>หักกับบิลใหม่ <strong className="tabular-nums">฿{money(done.offsetAmount)}</strong></p>
            )}
            {done.extraPaid > 0 && (
              <p className="text-green-700">เก็บเงินเพิ่ม <strong className="tabular-nums">฿{money(done.extraPaid)}</strong></p>
            )}
            {done.refundAmount > 0 && (
              <p className="text-red-700">คืนเงินลูกค้า <strong className="tabular-nums">฿{money(done.refundAmount)}</strong></p>
            )}
            {done.exchangeNumber && <p className="text-gray-500">บิลใหม่ {done.exchangeNumber}</p>}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            {done.exchangeTransactionId && (
              <Link
                href={`/print/receipt/${done.exchangeTransactionId}`}
                target="_blank"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Printer size={16} /> พิมพ์ใบเสร็จบิลใหม่
              </Link>
            )}
            <button
              onClick={() => { onDone?.(done); onClose() }}
              className="px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black"
            >
              เสร็จสิ้น
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  // ── ยังไม่ได้เลือกบิล ──────────────────────────────────────────────────────
  if (!bill) {
    return (
      <Shell onClose={onClose} title="รับคืน / เปลี่ยนสินค้า">
        <div className="p-5">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">เลขที่บิลเดิม</label>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              fetchBill(lookup)
            }}
          >
            <input
              autoFocus
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="เช่น RC110320260001"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loadingBill || !lookup.trim()}
              className="px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-2"
            >
              <Search size={15} /> ค้นหา
            </button>
          </form>
          {billError && <p className="text-sm text-red-600 mt-3">{billError}</p>}
          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            ใบคืนไม่แตะบิลเดิม — ยอดขายของวันที่ขายและ VAT เดือนนั้นไม่เปลี่ยนย้อนหลัง
            ต่างจากการยกเลิกใบเสร็จทั้งใบ · เลขที่บิลหาได้จากทะเบียนใบเสร็จหรือบนใบเสร็จของลูกค้า
          </p>
        </div>
      </Shell>
    )
  }

  const soldAt = new Date(bill.created_at).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  const discounted = bill.factor < 0.9995

  return (
    <Shell onClose={onClose} title={`รับคืน / เปลี่ยนสินค้า · บิล ${bill.transaction_number}`} wide>
      <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>ขายเมื่อ {soldAt} น.</span>
        <span>ยอดบิล ฿{money(bill.net_paid)}</span>
        <span>{bill.customer_name ? `ลูกค้า: ${bill.customer_name}` : 'ลูกค้าทั่วไป (ไม่ใช่สมาชิก)'}</span>
        {!initialBillId && (
          <button onClick={() => { setBill(null); setQty({}); setNewItems([]) }} className="text-blue-600 hover:text-blue-700">
            เปลี่ยนบิล
          </button>
        )}
      </div>

      {discounted && (
        <p className="mx-5 mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          บิลนี้มีส่วนลดท้ายบิล/ใช้แต้มเป็นส่วนลด — มูลค่าที่คืนคิดตามเงินที่ลูกค้าจ่ายจริง
          ({(bill.factor * 100).toFixed(1)}% ของราคาในบิล) ไม่ใช่ราคาป้าย
        </p>
      )}

      <div className="grid lg:grid-cols-2 gap-0 lg:divide-x divide-gray-100">
        {/* ── ซ้าย: ของที่รับคืน ── */}
        <div className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">1 · ของที่รับคืน</h3>
          <div className="space-y-1.5 max-h-72 overflow-y-auto -mx-1 px-1">
            {bill.items.map((item) => {
              const picked = qty[item.id] ?? 0
              const perUnit = item.quantity > 0 ? (item.subtotal / item.quantity) * bill.factor : 0
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border px-3 py-2 ${picked > 0 ? 'border-teal-300 bg-teal-50/50' : 'border-gray-200'}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 leading-snug">{item.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ขายไป {item.quantity} {item.unit_name ?? item.base_unit} · ฿{money(perUnit)}/
                        {item.unit_name ?? item.base_unit}
                        {item.returned > 0 && <span className="text-amber-700"> · คืนแล้ว {item.returned}</span>}
                        {item.is_reward && <span className="text-purple-700"> · ของแลกแต้ม</span>}
                      </p>
                    </div>
                    {item.remaining === 0 ? (
                      <span className="text-xs text-gray-400 shrink-0 pt-1">คืนครบแล้ว</span>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setItemQty(item.id, picked - 1, item.remaining)}
                          disabled={picked === 0}
                          className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-600 disabled:opacity-30"
                        >
                          <Minus size={13} />
                        </button>
                        <input
                          value={picked}
                          onChange={(e) => setItemQty(item.id, parseInt(e.target.value || '0', 10) || 0, item.remaining)}
                          inputMode="numeric"
                          className="w-10 h-7 text-center text-sm border border-gray-300 rounded tabular-nums"
                        />
                        <button
                          onClick={() => setItemQty(item.id, picked + 1, item.remaining)}
                          disabled={picked >= item.remaining}
                          className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-600 disabled:opacity-30"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <label className="flex items-start gap-2 mt-3 cursor-pointer">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="mt-0.5" />
            <span className="text-xs text-gray-700">
              คืนของเข้าสต็อก
              <span className="block text-gray-400">
                ไม่ติ๊กเมื่อของที่รับคืนขายต่อไม่ได้ (ชำรุด/หมดอายุ) — มูลค่ายังคืนให้ลูกค้าเหมือนกัน
              </span>
            </span>
          </label>

          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผล เช่น แมวไม่กิน, ซื้อผิดสูตร, ของชำรุด"
            className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ── ขวา: สินค้าใหม่ที่เอาไปแทน ── */}
        <div className="p-5 bg-gray-50/60">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            2 · สินค้าใหม่ที่เอาไปแทน <span className="font-normal text-gray-400">(ไม่มีก็ได้)</span>
          </h3>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="พิมพ์ชื่อ / SKU / บาร์โค้ด"
              className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {searching && <p className="text-xs text-gray-400 mt-1.5">กำลังค้น…</p>}
          {results.length > 0 && (
            <div className="mt-1.5 border border-gray-200 rounded-lg bg-white max-h-40 overflow-y-auto divide-y divide-gray-50">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addNewItem(p)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2"
                >
                  <span className="min-w-0 flex-1 text-sm text-gray-800 truncate">{p.name}</span>
                  <span className="text-sm tabular-nums text-gray-600">฿{money(p.price)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-1.5">
            {newItems.length === 0 && (
              <p className="text-xs text-gray-400">ไม่เลือกสินค้าใหม่ = คืนของล้วน คืนเงินให้ลูกค้าไปเลย</p>
            )}
            {newItems.map((i) => (
              <div key={i.product.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 leading-snug truncate">{i.product.name}</p>
                  <p className="text-xs text-gray-500">฿{money(i.unit_price)} / {i.product.unit}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setNewQty(i.product.id, i.quantity - 1)}
                    className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-600"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-7 text-center text-sm tabular-nums">{i.quantity}</span>
                  <button
                    onClick={() => setNewQty(i.product.id, i.quantity + 1)}
                    className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-600"
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    onClick={() => setNewQty(i.product.id, 0)}
                    className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-red-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <span className="w-20 text-right text-sm font-medium tabular-nums text-gray-900">
                  ฿{money(i.subtotal)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            บิลเปลี่ยนสินค้าคิดราคาปกติ ไม่คิดโปรโมชั่น/ของแลกแต้มให้อัตโนมัติ
            ถ้าของใหม่ต้องเข้าโปร ให้คืนเงินเป็นเครดิตแล้วขายใหม่ที่หน้าขายตามปกติ
          </p>
        </div>
      </div>

      {/* ── สรุปเงิน + ยืนยัน ── */}
      <div className="border-t border-gray-100 p-5 bg-white">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">3 · สรุปเงิน</h3>
        <div className="text-sm space-y-1 mb-3">
          <Row label="มูลค่าของที่รับคืน" value={`−฿${money(quote?.returnValue ?? 0)}`} />
          {exchangeGross > 0 && <Row label="สินค้าใหม่" value={`฿${money(exchangeGross)}`} />}
          {settle.offsetAmount > 0 && (
            <Row label="หักด้วยของที่คืน" value={`−฿${money(settle.offsetAmount)}`} muted />
          )}
          {settle.extraPaid > 0 && (
            <Row label="ลูกค้าจ่ายเพิ่ม" value={`฿${money(settle.extraPaid)}`} strong tone="text-green-700" />
          )}
          {settle.refundAmount > 0 && (
            <Row label="คืนเงินลูกค้า" value={`฿${money(settle.refundAmount)}`} strong tone="text-red-700" />
          )}
          {settle.extraPaid === 0 && settle.refundAmount === 0 && (quote?.returnValue ?? 0) > 0 && (
            <Row label="ไม่มีเงินเพิ่ม-ลด" value="฿0.00" muted />
          )}
          {quote && (quote.pointsRevoked > 0 || quote.pointsRestored + quote.rewardPointsBack > 0) && (
            <p className="text-xs text-gray-500 pt-1">
              แต้ม: ถอนคืน {quote.pointsRevoked} แต้ม
              {quote.pointsRestored + quote.rewardPointsBack > 0 &&
                ` · คืนให้ ${quote.pointsRestored + quote.rewardPointsBack} แต้ม`}
            </p>
          )}
        </div>

        {settle.extraPaid > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-600 mb-1.5">รับเงินส่วนต่างทาง</p>
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${method === m ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  {PAYMENT_LABEL[m]}
                </button>
              ))}
            </div>
            {method === 'cash' && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  inputMode="decimal"
                  placeholder="รับเงินมา (ไม่ใส่ก็ได้)"
                  className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {cashReceived !== '' && (
                  <span className={`text-sm ${cashShort < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {cashShort < 0 ? `ยังขาด ฿${money(-cashShort)}` : `เงินทอน ฿${money(cashShort)}`}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {needsRefundMethod && (
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-600 mb-1.5">คืนเงินส่วนที่เหลือทาง</p>
            <div className="flex flex-wrap gap-1.5">
              {REFUND_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setRefundMethod(o.value)}
                  disabled={o.value === 'credit' && !bill.customer_id}
                  className={`px-3 py-1.5 rounded-lg text-sm border disabled:opacity-40 ${refundMethod === o.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {refundMethod === 'credit' && bill.customer_id && (
              <p className="text-xs text-gray-500 mt-1.5">
                เครดิตคงเหลือตอนนี้ ฿{money(bill.customer_credit)} → จะเป็น ฿
                {money(bill.customer_credit + settle.refundAmount)} · ใช้หักบิลไหนก็ได้ครั้งหน้า
              </p>
            )}
            {!bill.customer_id && (
              <p className="text-xs text-gray-400 mt-1.5">
                บิลนี้ไม่มีลูกค้าสมาชิก — เก็บเป็นเครดิตไม่ได้ ต้องคืนเงินสดหรือโอน
              </p>
            )}
          </div>
        )}

        {!restock && (quote?.returnValue ?? 0) > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            ไม่คืนของเข้าสต็อก — ของที่รับคืนจะไม่โผล่ในยอดสต็อก ถ้าของยังขายต่อได้ให้ติ๊กคืนสต็อกด้วย
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={submit}
            disabled={saving || (quote?.lines.length ?? 0) === 0 || creditBlocked}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-40"
          >
            <RotateCcw size={16} />
            {saving
              ? 'กำลังบันทึก…'
              : newItems.length > 0
                ? `บันทึกการเปลี่ยนสินค้า${settle.extraPaid > 0 ? ` · เก็บเพิ่ม ฿${money(settle.extraPaid)}` : ''}`
                : `บันทึกการรับคืน · คืน ฿${money(settle.refundAmount)}`}
          </button>
        </div>
      </div>
    </Shell>
  )
}

function Row({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
  tone?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-gray-400' : 'text-gray-600'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold text-base' : ''} ${tone ?? (muted ? 'text-gray-400' : 'text-gray-900')}`}>
        {value}
      </span>
    </div>
  )
}

function Shell({
  title,
  children,
  onClose,
  wide,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-4xl' : 'max-w-md'} my-4`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="font-semibold text-gray-900 text-sm sm:text-base pr-2">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
