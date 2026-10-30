'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, CheckCircle2, Printer, AlertTriangle, History } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CartItem, Customer, PointsConfig, PaymentMethod, SalesChannel, RoundingMode } from '@/lib/types'
import { roundTotal } from '@/lib/rounding'
import { deductStock } from '@/lib/deductStock'
import { baseQty } from '@/lib/productUnits'
import { SALES_CHANNELS, isPlatformChannel } from '@/lib/salesChannel'
import { POS_DISPLAY_CHANNEL, type PosDisplayMessage } from '@/lib/posDisplay'
import { useReceiptPrint } from '@/lib/use-receipt-print'
import { isVatApplicable } from '@/lib/vat'
import { confirmDialog } from '@/lib/confirm'
import { BACKDATE_MAX_DAYS, fallsBeforeShift, fmtThai, inputBounds, toInputValue, validateBackdate } from '@/lib/backdate'

interface Props {
  cart: CartItem[]
  subtotal: number
  totalDiscount: number
  total: number
  customer: Customer | null
  pointsConfig: PointsConfig | null
  cashierId: string
  promptpayId: string | null
  roundingMode: RoundingMode
  /** เวชระเบียนคลินิกที่เก็บเงินรวมในบิลนี้ — จ่ายเสร็จ (หรือตัดสต็อกออก) จะ mark เป็น paid ทุกใบ */
  visitIds: string[]
  /** ขายอยู่ในโหมดบูธ — ล็อกช่องทางเป็น 'booth' แล้วผูกบิลเข้ารอบนั้น */
  boothTripId: string | null
  /** มีกะเปิดอยู่ไหม — ไม่มีแล้วเก็บเงินหน้าร้านจะเตือนก่อนกดยืนยัน */
  shiftOpen: boolean
  /** กะที่เปิดอยู่เปิดเมื่อไหร่ — คีย์บิลย้อนหลังไปก่อนเวลานี้ เงินสดจะไม่เข้ากะนี้ */
  shiftOpenedAt: string | null
  onClose: () => void
  onSuccess: (info?: { writeoff?: boolean }) => void
}

// qr ตัดออกจากตัวเลือก — ถือเป็นการโอนเงินแบบเดียวกับ transfer (ยังรองรับอ่านรายการเก่าที่บันทึกเป็น qr ไว้ที่อื่น)
type SplitMethod = Exclude<PaymentMethod, 'qr'>

const PAYMENT_LABELS: Record<SplitMethod, string> = {
  cash: '💵 เงินสด',
  transfer: '📲 โอนเงิน',
  card: '💳 บัตรเครดิต',
}

const SPLIT_METHODS = Object.keys(PAYMENT_LABELS) as SplitMethod[]

// ช่องทางที่เลือกเองได้ตรงนี้ — 'booth' มาจากสวิตช์โหมดบูธในหน้าขาย
// และ 'online' (เว็บร้าน) มาจากการยืนยันออเดอร์ที่ /admin/orders เท่านั้น ไม่ให้กดเองที่นี่
const STORE_CHANNELS = SALES_CHANNELS.filter((c) => c.value !== 'booth' && c.value !== 'online')

export default function PaymentModal({
  cart, subtotal, totalDiscount, total, customer, pointsConfig, cashierId, promptpayId, roundingMode, visitIds, boothTripId, shiftOpen, shiftOpenedAt, onClose, onSuccess,
}: Props) {
  // writeoff = ตัดของออกจากสต็อกเฉยๆ ไม่ใช่การขาย (ของเสีย/ของแถม/ใช้ในร้าน) — ไม่สร้างใบเสร็จ
  const [mode, setMode] = useState<'sale' | 'writeoff'>('sale')
  const [writeoffReason, setWriteoffReason] = useState('')
  const [writtenOff, setWrittenOff] = useState(false)
  const [channel, setChannel] = useState<SalesChannel>(boothTripId ? 'booth' : 'store')
  const [orderNo, setOrderNo] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')
  // แยกจ่าย: ลูกค้าจ่ายบิลเดียวหลายทาง เช่น โอน ฿57 + เงินสด ฿2 — ช่องทางละแถวเดียว
  const [splitMode, setSplitMode] = useState(false)
  const [splitLines, setSplitLines] = useState<{ method: SplitMethod; amount: string }[]>([])
  const [usePoints, setUsePoints] = useState(0)
  const [useCredit, setUseCredit] = useState(0)
  const [manualDiscountMode, setManualDiscountMode] = useState<'percent' | 'amount'>('percent')
  const [manualDiscountInput, setManualDiscountInput] = useState('')
  const [loading, setLoading] = useState(false)
  // คีย์บิลย้อนหลัง: ขายไปแล้วตอนเน็ตล่ม มาคีย์ตามทีหลัง — บิลลงวันที่ขายจริง ไม่ใช่วันที่คีย์
  const [backdating, setBackdating] = useState(false)
  const [soldAtInput, setSoldAtInput] = useState('')
  const [backdateReason, setBackdateReason] = useState('')
  // หลังบันทึกสำเร็จ เปลี่ยนเป็นหน้าเลือก เสร็จสิ้น/พิมพ์ใบเสร็จ แทนที่จะปิด modal ทันที
  const [completedTxId, setCompletedTxId] = useState<string | null>(null)
  const displayChannelRef = useRef<BroadcastChannel | null>(null)
  const { preload: preloadReceipt, print: printReceipt, ready: receiptReady } = useReceiptPrint()

  useEffect(() => {
    displayChannelRef.current = new BroadcastChannel(POS_DISPLAY_CHANNEL)
    return () => displayChannelRef.current?.close()
  }, [])

  // โหลดใบเสร็จไว้ใน iframe ซ่อนทันทีที่บันทึกบิลเสร็จ — ตอนกดพิมพ์จะไม่ต้องรอโหลดอีก
  useEffect(() => {
    if (completedTxId) preloadReceipt(completedTxId)
  }, [completedTxId, preloadReceipt])

  function openReceipt() {
    printReceipt()
  }

  const manualDiscountValue = parseFloat(manualDiscountInput || '0') || 0
  const manualDiscountAmount = Math.min(
    total,
    Math.max(0, manualDiscountMode === 'percent' ? (total * manualDiscountValue) / 100 : manualDiscountValue)
  )
  const afterManualDiscount = Math.max(0, total - manualDiscountAmount)

  const maxRedeemablePoints = customer && pointsConfig
    ? Math.min(customer.points, Math.floor(afterManualDiscount / pointsConfig.redeem_value) * pointsConfig.redeem_points)
    : 0
  const pointsDiscount = pointsConfig && usePoints > 0
    ? (usePoints / pointsConfig.redeem_points) * pointsConfig.redeem_value
    : 0
  const afterPointsDiscount = Math.max(0, afterManualDiscount - pointsDiscount)

  const maxCredit = customer ? Math.min(customer.credit_balance, afterPointsDiscount) : 0
  const beforeRounding = Math.max(0, afterPointsDiscount - useCredit)
  // ปัดเศษเป็นขั้นสุดท้าย หลังหักส่วนลด/แต้ม/เครดิตหมดแล้ว — ยอดที่ลูกค้าจ่ายจริงคือยอดที่ปัดแล้ว
  const { total: finalTotal, rounding } = roundTotal(beforeRounding, roundingMode)

  const change = method === 'cash' && cashReceived
    ? parseFloat(cashReceived) - finalTotal
    : 0

  const amountOf = (l: { amount: string }) => parseFloat(l.amount || '0') || 0
  const splitPaid = splitLines.reduce((sum, l) => sum + amountOf(l), 0)
  const splitCash = splitLines.filter((l) => l.method === 'cash').reduce((sum, l) => sum + amountOf(l), 0)
  // เงินทอนออกได้จากฝั่งเงินสดเท่านั้น โอน/บัตรรับเกินยอดบิลไม่ได้
  const splitChange = Math.max(0, splitPaid - finalTotal)
  const splitRemaining = Math.max(0, finalTotal - splitPaid)
  const splitError = !splitMode
    ? null
    : splitLines.some((l) => amountOf(l) <= 0)
      ? 'ใส่จำนวนเงินให้ครบทุกช่องทาง'
      : splitPaid - splitCash > finalTotal + 0.001
        ? 'ยอดโอน/บัตรเกินยอดบิล — ทอนเงินทางนั้นไม่ได้'
        : splitPaid < finalTotal - 0.001
          ? `ยังขาดอีก ฿${splitRemaining.toFixed(2)}`
          : null
  const unusedMethods = SPLIT_METHODS.filter((m) => !splitLines.some((l) => l.method === m))

  // ยอดที่ลงบิลจริงของแต่ละช่องทาง — หักเงินทอนออกจากฝั่งเงินสด ผลรวมจึงเท่ากับยอดบิลพอดี
  const splitAllocation = splitLines
    .map((l) => ({ method: l.method, amount: l.method === 'cash' ? amountOf(l) - splitChange : amountOf(l) }))
    .filter((l) => l.amount > 0)

  function toggleSplit() {
    if (splitMode) {
      setSplitMode(false)
      setSplitLines([])
      return
    }
    setSplitMode(true)
    setCashReceived('')
    setSplitLines([
      { method: method === 'qr' ? 'transfer' : method, amount: '' },
      { method: method === 'cash' ? 'transfer' : 'cash', amount: '' },
    ])
  }

  function setLine(index: number, patch: Partial<{ method: SplitMethod; amount: string }>) {
    setSplitLines(splitLines.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  const writeoff = mode === 'writeoff'
  const platform = !writeoff && isPlatformChannel(channel)

  // ย้อนหลังเฉพาะการขาย — "ตัดสต็อกออก" ไม่มีบิล ไม่มียอดเงิน ย้อนวันไปก็ไม่มีอะไรเปลี่ยน
  const canBackdate = !writeoff
  const backdateOn = backdating && canBackdate
  const backdateCheck = backdateOn ? validateBackdate(soldAtInput) : null
  // negligible = เลือกเวลาที่เท่ากับตอนนี้ ไม่ต้องทำอะไรเป็นพิเศษ (trigger ฝั่ง DB ก็ไม่ติดธงให้)
  const soldAt = backdateCheck?.ok && !backdateCheck.negligible ? backdateCheck.at : null
  const backdateError = backdateCheck && !backdateCheck.ok ? backdateCheck.error : null
  const backdateBeforeShift = soldAt ? fallsBeforeShift(soldAt, shiftOpenedAt) : false
  const bounds = inputBounds()

  function toggleBackdate() {
    if (backdateOn) {
      setBackdating(false)
      setSoldAtInput('')
      setBackdateReason('')
      return
    }
    setBackdating(true)
    // ตั้งต้นเป็นตอนนี้ แล้วให้แคชเชียร์เลื่อนย้อนไปเอง — พิมพ์วันเดือนปีใหม่ทั้งชุดช้ากว่า
    setSoldAtInput(toInputValue(new Date()))
    setBackdateReason('เน็ตล่ม')
  }

  // เงินทอนของบิลนี้ — null = ไม่ได้รับเงินสด หรือรับมายังไม่พอ ยังไม่ต้องโชว์
  const changeDue = writeoff || platform
    ? null
    : splitMode
      ? (splitError === null && splitLines.some((l) => l.method === 'cash') ? splitChange : null)
      : method === 'cash' && cashReceived && change >= 0
        ? change
        : null

  const earnedPoints = !platform && pointsConfig && finalTotal > 0
    ? Math.floor(finalTotal / pointsConfig.spend_amount) * pointsConfig.earn_points
    : 0

  // ปิดระบบแต้ม (pointsConfig = null) → ไม่ต้องขึ้นการ์ดแต้มบนจอลูกค้า
  const displayCustomer = customer && pointsConfig
    ? { name: customer.name, pointsBefore: customer.points, pointsEarned: earnedPoints, pointsAfter: customer.points + earnedPoints - usePoints }
    : null

  // ส่งสถานะให้จอลูกค้า (จอสอง) ทุกครั้งที่ยอด/วิธีจ่าย/แต้มเปลี่ยน จนกว่าจะบันทึกสำเร็จ
  // โหมดตัดสต็อกไม่ใช่การขาย — อย่าขึ้นยอดให้ลูกค้าเห็น
  useEffect(() => {
    if (completedTxId || mode === 'writeoff') return
    const msg: PosDisplayMessage = {
      stage: 'payment',
      subtotal,
      discount: Math.max(0, subtotal - finalTotal),
      total: finalTotal,
      method: method as Exclude<PaymentMethod, 'qr'>,
      promptpayId,
      customer: displayCustomer,
    }
    displayChannelRef.current?.postMessage(msg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalTotal, method, promptpayId, customer, earnedPoints, usePoints, completedTxId, mode])

  async function handleConfirm() {
    // ตัดสต็อกออกเฉยๆ — ไม่สร้างใบเสร็จ ไม่แตะแต้ม/เครดิต (แต่ปิดเวชระเบียนที่ดึงมา)
    if (writeoff) {
      const reason = writeoffReason.trim()
      if (!reason) {
        toast.error('ใส่เหตุผลที่ตัดออกด้วย')
        return
      }
      setLoading(true)
      const writeoffDb = createClient()
      await deductStock(writeoffDb, cart, {
        transactionId: null,
        type: 'adjust_out',
        reason: `ตัดสต็อกออก: ${reason}`,
        createdBy: cashierId,
      })
      // ของในเวชระเบียนถูกตัดออกไปแล้ว ไม่มีอะไรให้เก็บเงินอีก — ปิดใบไม่ให้ค้างในคิวแคชเชียร์
      // (status paid แต่ไม่มี transaction_id เหมือนปุ่ม "จบการรักษาไม่คิดเงิน" ฝั่งหมอ)
      if (visitIds.length > 0) {
        const stamp = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
        const line = `[ตัดสต็อกออก ไม่คิดเงิน ${stamp}] ${reason}`
        const { data: visits } = await writeoffDb.from('visits').select('id, notes').in('id', visitIds)
        // หมายเหตุเดิมของแต่ละใบไม่เหมือนกัน ต่อท้ายทีละใบ ไม่งั้นโน้ตของใบหนึ่งจะไปทับอีกใบ
        for (const v of visits ?? []) {
          await writeoffDb
            .from('visits')
            .update({ status: 'paid', notes: [v.notes?.trim(), line].filter(Boolean).join('\n') })
            .eq('id', v.id)
        }
      }
      setLoading(false)
      setWrittenOff(true)
      return
    }

    if (backdateError) {
      toast.error(backdateError)
      return
    }

    if (splitMode && !platform) {
      if (splitError) {
        toast.error(splitError)
        return
      }
    } else if (method === 'cash' && parseFloat(cashReceived || '0') < finalTotal) {
      toast.error('รับเงินไม่พอ')
      return
    }

    // ย้อนวันขายคือแก้ตัวเลขของวันที่ปิดไปแล้ว ต้องยืนยันอีกชั้นพร้อมโชว์วันเวลาที่จะลง
    if (soldAt) {
      const warn = backdateBeforeShift
        ? '\n\nบิลนี้ขายก่อนเวลาที่เปิดกะ — เงินสดจะไม่ถูกนับในกะที่เปิดอยู่'
        : ''
      const ok = await confirmDialog({
        title: 'คีย์บิลย้อนหลัง',
        message: `บันทึกเป็นการขายเมื่อ ${fmtThai(soldAt)} น. · ยอด ฿${finalTotal.toFixed(2)}${warn}`,
        confirmLabel: 'บันทึกย้อนหลัง',
      })
      if (!ok.confirmed) return
    }

    setLoading(true)
    const supabase = createClient()
    // เวลาที่ขายจริง — ส่งลง created_at ของบิล/รายการ/ประวัติสต็อค ให้ทุกอย่างลงวันเดียวกัน
    const soldAtISO = soldAt ? soldAt.toISOString() : null

    const splitting = splitMode && !platform && !writeoff && splitAllocation.length > 0
    // payment_method เก็บช่องทางที่ยอดเยอะสุดไว้ ให้หน้าที่ยังอ่านคอลัมน์เดิมไม่พัง (แค่เห็นไม่ละเอียด)
    const primaryMethod: PaymentMethod = splitting
      ? splitAllocation.reduce((best, l) => (l.amount > best.amount ? l : best)).method
      : method
    const cashIn = splitting ? splitCash : method === 'cash' ? parseFloat(cashReceived || '0') : null
    const changeOut = splitting ? splitChange : method === 'cash' ? Math.max(0, change) : null

    // เลขที่ RCxxyyzzzzbbbb จาก DB function — ถ้าชนกัน (ขายพร้อมกัน 2 เครื่อง) ลองใหม่อีกรอบ
    // บิลย้อนหลังขอเลขของ "วันที่ขาย" ไม่ใช่วันนี้ ไม่งั้นเลขบนใบเสร็จจะขัดกับวันที่บนใบเสร็จเอง
    let tx: { id: string; transaction_number: string } | null = null
    let lastError: string | undefined
    for (let attempt = 0; attempt < 2 && !tx; attempt++) {
      const { data: txNumber, error: numError } = await supabase.rpc(
        'next_transaction_number',
        soldAtISO ? { p_at: soldAtISO } : {},
      )
      if (numError || !txNumber) {
        toast.error('สร้างเลขที่รายการไม่สำเร็จ: ' + numError?.message)
        setLoading(false)
        return
      }

      const { data, error: txError } = await supabase
        .from('transactions')
        .insert({
          transaction_number: txNumber,
          cashier_id: cashierId,
          customer_id: customer?.id ?? null,
          subtotal,
          discount: totalDiscount + manualDiscountAmount + pointsDiscount,
          total: finalTotal,
          rounding,
          payment_method: primaryMethod,
          sales_channel: channel,
          external_order_no: isPlatformChannel(channel) ? (orderNo.trim() || null) : null,
          booth_trip_id: channel === 'booth' ? boothTripId : null,
          cash_received: cashIn && cashIn > 0 ? cashIn : null,
          change_given: cashIn && cashIn > 0 ? (changeOut ?? 0) : null,
          points_earned: earnedPoints,
          points_used: usePoints,
          credit_used: useCredit,
          notes: manualDiscountAmount > 0
            ? `ส่วนลดเพิ่มเติม: ${manualDiscountMode === 'percent' ? `${manualDiscountValue}%` : `฿${manualDiscountValue.toFixed(2)}`} (฿${manualDiscountAmount.toFixed(2)})`
            : null,
          // บิลย้อนหลัง: created_at = เวลาที่ขายจริง ส่วน recorded_at (เวลาที่คีย์) trigger เขียนให้เอง
          ...(soldAtISO ? { created_at: soldAtISO, backdate_reason: backdateReason.trim() || null } : {}),
        })
        .select('id, transaction_number')
        .single()

      if (data) {
        tx = data
      } else {
        lastError = txError?.message
        if (txError?.code !== '23505') break
      }
    }

    if (!tx) {
      toast.error('เกิดข้อผิดพลาด: ' + lastError)
      setLoading(false)
      return
    }

    // บันทึกว่าเงินเข้าช่องทางไหนบ้าง — เฉพาะบิลที่แยกจ่าย บิลจ่ายทางเดียวไม่ต้องมีแถวเลย
    if (splitting) {
      const { error: payError } = await supabase.from('transaction_payments').insert(
        splitAllocation.map((l) => ({
          transaction_id: tx.id,
          method: l.method,
          amount: l.amount,
          ...(soldAtISO ? { created_at: soldAtISO } : {}),
        })),
      )
      // บิลบันทึกไปแล้ว ยอดรวมถูกต้อง — ไม่ย้อนกลับ แต่ต้องบอกให้รู้ว่ารายงานจะเห็นเป็นช่องทางเดียว
      if (payError) {
        toast.error(`บิล ${tx.transaction_number} บันทึกแล้ว แต่เก็บรายละเอียดการแยกจ่ายไม่สำเร็จ — รายงานจะนับเป็น${PAYMENT_LABELS[primaryMethod as SplitMethod] ?? primaryMethod}ทั้งบิล`, { duration: 8000 })
      }
    }

    // Insert transaction items + deduct stock (FEFO)
    const itemInserts = cart.map((item) => ({
      transaction_id: tx.id,
      product_id: item.product.id,
      product_lot_id: item.lot_id,
      // หน่วยที่ขาย — quantity คือจำนวน "หน่วยนั้น" (2 กล่อง) ส่วน base_quantity ที่ DB คิดให้
      // คือจำนวนหน่วยฐานที่ตัดสต็อคจริง (24 ซอง) ชื่อหน่วยเก็บเป็น snapshot ไว้พิมพ์ใบเสร็จ
      product_unit_id: item.unit?.id ?? null,
      unit_factor: item.unit?.factor ?? 1,
      unit_name: item.unit?.unit_name ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount,
      subtotal: item.subtotal,
      // เก็บสถานะ VAT ณ วันที่ขาย (ยังไม่ได้คิดเงิน VAT — ไว้ใช้ตอนจดทะเบียนแล้ว)
      vat_applicable: isVatApplicable(item.product),
      ...(soldAtISO ? { created_at: soldAtISO } : {}),
    }))

    await supabase.from('transaction_items').insert(itemInserts)

    await deductStock(supabase, cart, {
      transactionId: tx.id,
      type: 'sale',
      reason: tx.transaction_number,
      createdBy: cashierId,
      occurredAt: soldAtISO,
    })

    // ปิดเวชระเบียนคลินิกที่เพิ่งเก็บเงิน — ผูกกับบิลไว้เพื่อพิมพ์ใบเสร็จซ้ำ/คืนสถานะตอนยกเลิกบิล
    // เจ้าของเดียวกันหลายใบรวมเป็นบิลเดียวได้ ทุกใบผูกกับบิลนั้นเหมือนกันหมด
    if (visitIds.length > 0) {
      await supabase
        .from('visits')
        .update({ status: 'paid', transaction_id: tx.id })
        .in('id', visitIds)
    }

    // Update customer points + credit
    if (customer) {
      await supabase
        .from('customers')
        .update({
          points: customer.points + earnedPoints - usePoints,
          total_spent: customer.total_spent + finalTotal,
          credit_balance: customer.credit_balance - useCredit,
        })
        .eq('id', customer.id)
    }

    // แจ้งเตือน Telegram — งานเสริม ล้มเหลวไม่ให้กระทบการขาย
    fetch('/api/notify/sale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: tx.id }),
    }).catch(() => {})

    setLoading(false)
    setCompletedTxId(tx.id)
    displayChannelRef.current?.postMessage({
      stage: 'done',
      total: finalTotal,
      customer: displayCustomer,
    } satisfies PosDisplayMessage)
  }

  if (writtenOff) {
    const pieces = cart.reduce((n, i) => n + baseQty(i), 0)
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
          <CheckCircle2 size={48} className="mx-auto text-red-500 mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">ตัดสต็อกออกแล้ว</h2>
          <p className="text-sm text-gray-500 mb-1">{cart.length} รายการ · {pieces} ชิ้น</p>
          <p className="text-xs text-gray-400 mb-4">{writeoffReason.trim()}</p>
          <button
            onClick={() => onSuccess({ writeoff: true })}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-base transition-colors"
          >
            เสร็จสิ้น
          </button>
        </div>
      </div>
    )
  }

  if (completedTxId) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
          <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">{platform ? 'บันทึกออเดอร์แล้ว' : 'ชำระเงินสำเร็จ'}</h2>
          <p className="text-2xl font-bold text-gray-900 mb-1">฿{finalTotal.toFixed(2)}</p>
          {method === 'cash' && change > 0 && (
            <p className="text-sm text-blue-600 mb-4">เงินทอน ฿{change.toFixed(2)}</p>
          )}
          {!(method === 'cash' && change > 0) && <div className="mb-4" />}

          <div className="space-y-2">
            <button
              onClick={() => onSuccess()}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-base transition-colors"
            >
              <CheckCircle2 size={18} />
              เสร็จสิ้น (ไม่พิมพ์ใบเสร็จ)
            </button>
            <button
              onClick={openReceipt}
              className="w-full flex items-center justify-center gap-2 border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
            >
              <Printer size={16} />
              {receiptReady ? 'พิมพ์ใบเสร็จ' : 'กำลังเตรียมใบเสร็จ…'}
            </button>
            <button
              onClick={() => { openReceipt(); onSuccess() }}
              className="w-full text-gray-400 hover:text-gray-600 font-medium py-2 text-sm transition-colors"
            >
              เสร็จสิ้นพร้อมพิมพ์ใบเสร็จ
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        <div className="shrink-0 bg-white rounded-t-2xl flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">
            {writeoff ? 'ตัดสต็อกออก' : platform ? 'บันทึกออเดอร์ออนไลน์' : 'ชำระเงิน'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {/* ช่องทางขาย — ออนไลน์เงินเข้าผ่านแพลตฟอร์ม ไม่ใช่เงินสดหน้าร้าน */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">ช่องทางขาย</p>
            {/* ขายที่บูธมาจากสวิตช์โหมดบูธในหน้าขาย เลือกตรงนี้ไม่ได้ ไม่งั้นบิลจะไม่ผูกกับรอบ */}
            {boothTripId ? (
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                งานออกบูธ — บิลนี้จะเข้ารอบที่เปิดอยู่
              </div>
            ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {STORE_CHANNELS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => {
                    setMode('sale')
                    setChannel(c.value)
                    // ขายออนไลน์เงินเข้าบัญชีร้านผ่านแพลตฟอร์ม ตั้งเป็นโอนให้เลย
                    if (isPlatformChannel(c.value) && method === 'cash') setMethod('transfer')
                    // ออนไลน์ไม่ได้รับเงินที่ร้าน ไม่มีอะไรให้แยก
                    if (isPlatformChannel(c.value) && splitMode) toggleSplit()
                  }}
                  className={`py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                    !writeoff && channel === c.value
                      ? 'border-[#C4865A] bg-[#FDF6EE] text-[#7A4E2D]'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {c.short}
                </button>
              ))}
            </div>
            )}
            {/* สองปุ่มนี้คู่กัน — เรียงซ้อนกันทีละแถวทำให้ต้องเลื่อนหาปุ่มยืนยันชำระเงิน */}
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setMode(writeoff ? 'sale' : 'writeoff')}
                className={`rounded-lg border-2 py-1.5 text-xs font-medium leading-tight transition-colors ${
                  writeoff
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                ตัดสต็อกออก
                <span className="block text-[10px] font-normal opacity-70">ไม่ใช่การขาย</span>
              </button>
              {/* ปิดตอนตัดสต็อกออก — ไม่มีบิล ไม่มียอดเงิน ย้อนวันไปก็ไม่มีอะไรเปลี่ยน */}
              <button
                onClick={toggleBackdate}
                disabled={!canBackdate}
                className={`flex flex-col items-center justify-center rounded-lg border-2 py-1.5 text-xs font-medium leading-tight transition-colors disabled:opacity-40 ${
                  backdateOn
                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                    : 'border-gray-200 text-gray-600 enabled:hover:border-gray-300'
                }`}
              >
                <span className="flex items-center gap-1">
                  <History size={13} />
                  คีย์ย้อนหลัง
                </span>
                <span className="block text-[10px] font-normal opacity-70">
                  {backdateOn ? 'กดอีกครั้งเพื่อยกเลิก' : 'ขายตอนเน็ตล่ม'}
                </span>
              </button>
            </div>
          </div>

          {/* คีย์บิลย้อนหลัง — ขายไปแล้วตอนเน็ตล่ม/ไฟดับ แล้วมาคีย์ตามทีหลัง (ปุ่มเปิดอยู่เหนือขึ้นไป) */}
          {backdateOn && (
            <div className="space-y-2 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-amber-900">ขายจริงเมื่อ</label>
                <input
                  type="datetime-local"
                  value={soldAtInput}
                  onChange={(e) => setSoldAtInput(e.target.value)}
                  min={bounds.min}
                  max={bounds.max}
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <p className="mt-1 text-[11px] text-amber-700">ย้อนได้ไม่เกิน {BACKDATE_MAX_DAYS} วัน</p>
              </div>

              {backdateError ? (
                <p className="flex items-start gap-1.5 text-xs font-medium text-red-700">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  {backdateError}
                </p>
              ) : soldAt ? (
                <p className="text-xs text-amber-900">
                  บิลจะลงวันที่ <b>{fmtThai(soldAt)} น.</b> — เลขที่บิล ใบเสร็จ รายงาน และประวัติสต็อก
                  ใช้วันนั้นทั้งหมด แต่<b>แต้ม โปรโมชัน และสต็อกคิดจากข้อมูลตอนนี้</b>
                </p>
              ) : (
                <p className="text-xs text-amber-800">เวลาที่เลือกคือตอนนี้ — จะบันทึกเป็นบิลปกติ</p>
              )}

              {backdateBeforeShift && (
                <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    <b>ขายก่อนเวลาที่เปิดกะ</b> — เงินสดบิลนี้จะไม่ถูกนับในกะที่เปิดอยู่
                    ปิดกะแล้วเงินในเก๊ะจะเกินยอดที่ระบบคิดไว้เท่ายอดบิลนี้
                  </span>
                </p>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-amber-900">เหตุผล</label>
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {['เน็ตล่ม', 'ไฟดับ', 'ระบบล่ม', 'ลืมคีย์'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setBackdateReason(r)}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        backdateReason === r
                          ? 'border-amber-500 bg-white text-amber-800'
                          : 'border-amber-200 bg-white/60 text-amber-700'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={backdateReason}
                  onChange={(e) => setBackdateReason(e.target.value)}
                  placeholder="หรือพิมพ์เหตุผลเอง"
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
          )}

          {/* เตือนตอนเก็บเงินหน้าร้านโดยไม่มีกะเปิด — แถบบนหน้าขายถูกโมดอลนี้ทับอยู่ */}
          {!shiftOpen && !writeoff && channel === 'store' && (
            <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <b>ยังไม่ได้เปิดกะ</b> — บิลนี้บันทึกได้ปกติ แต่เงินจะไม่ถูกนับในกะไหน ปิดกะแล้วยอดจะไม่ตรงกับเงินในเก๊ะ
              </span>
            </p>
          )}

          {platform && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่ออเดอร์ (ถ้ามี)</label>
              <input
                type="text"
                value={orderNo}
                onChange={(e) => setOrderNo(e.target.value)}
                placeholder="เช่น 250110ABCDEFGH"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {writeoff && (
            <div className="space-y-2">
              <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
                ของจะถูกหักออกจากสต็อกตามตะกร้า แต่ <b>ไม่บันทึกเป็นการขาย</b> ไม่มีใบเสร็จ ไม่มียอดเงิน
                {visitIds.length > 0 && <> · ใบตรวจรักษาที่ดึงมา ({visitIds.length}) จะถูก<b>ปิดโดยไม่คิดเงิน</b></>}
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผล</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['ของเสีย/หมดอายุ', 'ของแถม/ตัวอย่าง', 'ใช้ในร้าน', 'ของหาย'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setWriteoffReason(r)}
                      className={`px-2.5 py-1 rounded-lg text-xs border ${
                        writeoffReason === r ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={writeoffReason}
                  onChange={(e) => setWriteoffReason(e.target.value)}
                  placeholder="หรือพิมพ์เหตุผลเอง"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
          )}

          {platform && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              ไม่ต้องรับเงินที่ร้าน — ยอดเงินไปเก็บจากแพลตฟอร์มโดยตรง ตรงนี้แค่บันทึกบิลและตัดสต็อก
            </p>
          )}

          {/* Payment Method */}
          <div className={platform || writeoff ? 'hidden' : ''}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">วิธีชำระเงิน</p>
              <button
                onClick={toggleSplit}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {splitMode ? 'กลับไปจ่ายทางเดียว' : 'แยกจ่ายหลายทาง'}
              </button>
            </div>

            {!splitMode ? (
              <div className="grid grid-cols-2 gap-2">
                {SPLIT_METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                      method === m
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {PAYMENT_LABELS[m]}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {splitLines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={line.method}
                      onChange={(e) => setLine(i, { method: e.target.value as SplitMethod })}
                      className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white w-32 shrink-0"
                    >
                      {SPLIT_METHODS.filter(
                        (m) => m === line.method || !splitLines.some((l) => l.method === m),
                      ).map((m) => (
                        <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="0"
                      value={line.amount}
                      onChange={(e) => setLine(i, { amount: e.target.value })}
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => setLine(i, { amount: (amountOf(line) + splitRemaining).toFixed(2) })}
                      disabled={splitRemaining <= 0}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium px-1 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="ใส่ยอดที่ยังขาดทั้งหมดลงช่องนี้"
                    >
                      ที่เหลือ
                    </button>
                    {splitLines.length > 2 && (
                      <button
                        onClick={() => setSplitLines(splitLines.filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-500 shrink-0"
                        title="เอาช่องทางนี้ออก"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}

                {unusedMethods.length > 0 && (
                  <button
                    onClick={() => setSplitLines([...splitLines, { method: unusedMethods[0], amount: '' }])}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + เพิ่มช่องทาง
                  </button>
                )}

                <div className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-500">รับมาแล้ว ฿{splitPaid.toFixed(2)} จาก ฿{finalTotal.toFixed(2)}</span>
                  {splitError ? (
                    <span className="font-medium text-amber-600">{splitError}</span>
                  ) : splitChange > 0 ? (
                    <span className="font-medium text-blue-600">เงินทอน ฿{splitChange.toFixed(2)}</span>
                  ) : (
                    <span className="font-medium text-green-600">ครบพอดี</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Manual discount */}
          <div className={`bg-orange-50 rounded-lg p-3 ${platform || writeoff ? 'hidden' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-900">ส่วนลดเพิ่มเติม</p>
              <div className="flex bg-white rounded-lg border border-gray-200 p-0.5">
                <button
                  onClick={() => setManualDiscountMode('percent')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    manualDiscountMode === 'percent' ? 'bg-orange-500 text-white' : 'text-gray-500'
                  }`}
                >
                  %
                </button>
                <button
                  onClick={() => setManualDiscountMode('amount')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    manualDiscountMode === 'amount' ? 'bg-orange-500 text-white' : 'text-gray-500'
                  }`}
                >
                  บาท
                </button>
              </div>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={manualDiscountMode === 'percent' ? 100 : undefined}
              step="0.01"
              placeholder="0"
              value={manualDiscountInput}
              onChange={(e) => setManualDiscountInput(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            />
            {manualDiscountAmount > 0 && (
              <p className="text-xs text-orange-600 mt-1">ลด ฿{manualDiscountAmount.toFixed(2)}</p>
            )}
          </div>

          {/* Cash input */}
          {method === 'cash' && !platform && !writeoff && !splitMode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รับเงิน</label>
              <input
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
                min={finalTotal}
                step="0.01"
              />
              <div className="flex gap-2 mt-2">
                {[finalTotal, Math.ceil(finalTotal / 100) * 100, Math.ceil(finalTotal / 500) * 500, 1000].filter(
                  (v, i, arr) => arr.indexOf(v) === i && v >= finalTotal
                ).slice(0, 4).map((val) => (
                  <button
                    key={val}
                    onClick={() => setCashReceived(val.toString())}
                    className="flex-1 text-xs py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700"
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Points */}
          {!platform && !writeoff && customer && pointsConfig && customer.points > 0 && (
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">ใช้แต้ม</p>
                  <p className="text-xs text-gray-500">คงเหลือ {customer.points} แต้ม</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setUsePoints(Math.max(0, usePoints - Math.min(10, pointsConfig.redeem_points)))}
                    className="w-7 h-7 flex items-center justify-center bg-white rounded-full border border-gray-200 text-gray-600 text-sm shrink-0"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={maxRedeemablePoints}
                    value={usePoints}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || '0', 10)
                      setUsePoints(Math.max(0, Math.min(maxRedeemablePoints, Number.isNaN(v) ? 0 : v)))
                    }}
                    className="w-16 text-sm font-bold text-center bg-white rounded-lg border border-gray-200 py-1"
                  />
                  <button
                    onClick={() => setUsePoints(Math.min(maxRedeemablePoints, usePoints + Math.min(10, pointsConfig.redeem_points)))}
                    className="w-7 h-7 flex items-center justify-center bg-white rounded-full border border-gray-200 text-gray-600 text-sm shrink-0"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setUsePoints(maxRedeemablePoints)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 pl-1 shrink-0"
                  >
                    สูงสุด
                  </button>
                </div>
              </div>
              {usePoints > 0 && (
                <p className="text-xs text-green-600 mt-1">ลด ฿{pointsDiscount.toFixed(2)}</p>
              )}
            </div>
          )}

          {/* Store credit */}
          {customer && customer.credit_balance > 0 && (
            <div className="bg-emerald-50 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">ใช้เครดิต</p>
                  <p className="text-xs text-gray-500">คงเหลือ ฿{customer.credit_balance.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={maxCredit}
                    step="0.01"
                    value={useCredit || ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value || '0')
                      setUseCredit(Math.max(0, Math.min(maxCredit, Number.isNaN(v) ? 0 : v)))
                    }}
                    placeholder="0"
                    className="w-20 text-sm font-bold text-center bg-white rounded-lg border border-gray-200 py-1"
                  />
                  <button
                    onClick={() => setUseCredit(maxCredit)}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700 pl-1 shrink-0"
                  >
                    สูงสุด
                  </button>
                </div>
              </div>
              {useCredit > 0 && (
                <p className="text-xs text-emerald-600 mt-1">ลด ฿{useCredit.toFixed(2)}</p>
              )}
            </div>
          )}

          {/* Summary */}
          <div className={`bg-gray-50 rounded-lg p-3 space-y-1.5 ${writeoff ? 'hidden' : ''}`}>
            <div className="flex justify-between text-sm text-gray-500">
              <span>ยอดรวม</span>
              <span>฿{total.toFixed(2)}</span>
            </div>
            {manualDiscountAmount > 0 && (
              <div className="flex justify-between text-sm text-orange-600">
                <span>ส่วนลดเพิ่มเติม{manualDiscountMode === 'percent' ? ` (${manualDiscountValue}%)` : ''}</span>
                <span>-฿{manualDiscountAmount.toFixed(2)}</span>
              </div>
            )}
            {pointsDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>ลดด้วยแต้ม ({usePoints} แต้ม)</span>
                <span>-฿{pointsDiscount.toFixed(2)}</span>
              </div>
            )}
            {useCredit > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>ใช้เครดิต</span>
                <span>-฿{useCredit.toFixed(2)}</span>
              </div>
            )}
            {rounding !== 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>ปัดเศษ</span>
                <span>{rounding > 0 ? '+' : '-'}฿{Math.abs(rounding).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base text-gray-900 pt-1 border-t border-gray-200">
              <span>ยอดที่ต้องชำระ</span>
              <span>฿{finalTotal.toFixed(2)}</span>
            </div>
            {splitMode && !platform && !writeoff && splitAllocation.map((l) => (
              <div key={l.method} className="flex justify-between text-sm text-gray-600">
                <span>{PAYMENT_LABELS[l.method]}</span>
                <span>฿{l.amount.toFixed(2)}</span>
              </div>
            ))}
            {earnedPoints > 0 && (
              <div className="text-xs text-purple-600 pt-1">
                ได้รับ {earnedPoints} แต้ม
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 p-3 border-t border-gray-100 bg-white">
          {changeDue !== null && (
            <div className={`flex items-center justify-between rounded-xl px-4 py-2 mb-2 ${
              changeDue > 0 ? 'bg-blue-50 border-2 border-blue-200' : 'bg-gray-50 border-2 border-gray-100'
            }`}>
              <span className={`text-base font-semibold ${changeDue > 0 ? 'text-blue-900' : 'text-gray-500'}`}>
                เงินทอน
              </span>
              <span className={`text-2xl font-extrabold tabular-nums ${changeDue > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                ฿{changeDue.toFixed(2)}
              </span>
            </div>
          )}
          <button
            onClick={handleConfirm}
            disabled={
              loading ||
              (writeoff && !writeoffReason.trim()) ||
              (!writeoff && !platform && splitMode && splitError !== null) ||
              (!writeoff && !platform && !splitMode && method === 'cash' && (!cashReceived || parseFloat(cashReceived) < finalTotal))
            }
            className={`w-full disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-base transition-colors ${
              writeoff ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {loading
              ? 'กำลังบันทึก...'
              : writeoff ? '✓ ตัดสต็อกออก'
                : platform ? '✓ บันทึกและตัดสต็อก'
                  : '✓ ยืนยันชำระเงิน'}
          </button>
        </div>
      </div>
    </div>
  )
}
