'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, CheckCircle2, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CartItem, Customer, PointsConfig, PaymentMethod, SalesChannel, RoundingMode } from '@/lib/types'
import { roundTotal } from '@/lib/rounding'
import { deductStock } from '@/lib/deductStock'
import { SALES_CHANNELS, isOnlineChannel } from '@/lib/salesChannel'
import { POS_DISPLAY_CHANNEL, type PosDisplayMessage } from '@/lib/posDisplay'
import { isVatApplicable } from '@/lib/vat'

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
  /** เก็บเงินให้เวชระเบียนคลินิกใบไหน — จ่ายเสร็จ (หรือตัดสต็อกออก) จะ mark เป็น paid */
  visitId: string | null
  onClose: () => void
  onSuccess: (info?: { writeoff?: boolean }) => void
}

// qr ตัดออกจากตัวเลือก — ถือเป็นการโอนเงินแบบเดียวกับ transfer (ยังรองรับอ่านรายการเก่าที่บันทึกเป็น qr ไว้ที่อื่น)
const PAYMENT_LABELS: Record<Exclude<PaymentMethod, 'qr'>, string> = {
  cash: '💵 เงินสด',
  transfer: '📲 โอนเงิน',
  card: '💳 บัตรเครดิต',
}

export default function PaymentModal({
  cart, subtotal, totalDiscount, total, customer, pointsConfig, cashierId, promptpayId, roundingMode, visitId, onClose, onSuccess,
}: Props) {
  // writeoff = ตัดของออกจากสต็อกเฉยๆ ไม่ใช่การขาย (ของเสีย/ของแถม/ใช้ในร้าน) — ไม่สร้างใบเสร็จ
  const [mode, setMode] = useState<'sale' | 'writeoff'>('sale')
  const [writeoffReason, setWriteoffReason] = useState('')
  const [writtenOff, setWrittenOff] = useState(false)
  const [channel, setChannel] = useState<SalesChannel>('store')
  const [orderNo, setOrderNo] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [usePoints, setUsePoints] = useState(0)
  const [useCredit, setUseCredit] = useState(0)
  const [manualDiscountMode, setManualDiscountMode] = useState<'percent' | 'amount'>('percent')
  const [manualDiscountInput, setManualDiscountInput] = useState('')
  const [loading, setLoading] = useState(false)
  // หลังบันทึกสำเร็จ เปลี่ยนเป็นหน้าเลือก เสร็จสิ้น/พิมพ์ใบเสร็จ แทนที่จะปิด modal ทันที
  const [completedTxId, setCompletedTxId] = useState<string | null>(null)
  const displayChannelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    displayChannelRef.current = new BroadcastChannel(POS_DISPLAY_CHANNEL)
    return () => displayChannelRef.current?.close()
  }, [])

  function openReceipt() {
    if (completedTxId) window.open(`/print/receipt/${completedTxId}`, '_blank')
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

  const writeoff = mode === 'writeoff'
  const online = !writeoff && isOnlineChannel(channel)
  const earnedPoints = !online && pointsConfig && finalTotal > 0
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
      if (visitId) {
        const { data: v } = await writeoffDb.from('visits').select('notes').eq('id', visitId).single()
        const stamp = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
        const line = `[ตัดสต็อกออก ไม่คิดเงิน ${stamp}] ${reason}`
        await writeoffDb
          .from('visits')
          .update({ status: 'paid', notes: [v?.notes?.trim(), line].filter(Boolean).join('\n') })
          .eq('id', visitId)
      }
      setLoading(false)
      setWrittenOff(true)
      return
    }

    if (method === 'cash' && parseFloat(cashReceived || '0') < finalTotal) {
      toast.error('รับเงินไม่พอ')
      return
    }

    setLoading(true)
    const supabase = createClient()

    // เลขที่ RCxxyyzzzzbbbb จาก DB function — ถ้าชนกัน (ขายพร้อมกัน 2 เครื่อง) ลองใหม่อีกรอบ
    let tx: { id: string; transaction_number: string } | null = null
    let lastError: string | undefined
    for (let attempt = 0; attempt < 2 && !tx; attempt++) {
      const { data: txNumber, error: numError } = await supabase.rpc('next_transaction_number')
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
          payment_method: method,
          sales_channel: channel,
          external_order_no: isOnlineChannel(channel) ? (orderNo.trim() || null) : null,
          cash_received: method === 'cash' ? parseFloat(cashReceived) : null,
          change_given: method === 'cash' ? Math.max(0, change) : null,
          points_earned: earnedPoints,
          points_used: usePoints,
          credit_used: useCredit,
          notes: manualDiscountAmount > 0
            ? `ส่วนลดเพิ่มเติม: ${manualDiscountMode === 'percent' ? `${manualDiscountValue}%` : `฿${manualDiscountValue.toFixed(2)}`} (฿${manualDiscountAmount.toFixed(2)})`
            : null,
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

    // Insert transaction items + deduct stock (FEFO)
    const itemInserts = cart.map((item) => ({
      transaction_id: tx.id,
      product_id: item.product.id,
      product_lot_id: item.lot_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount,
      subtotal: item.subtotal,
      // เก็บสถานะ VAT ณ วันที่ขาย (ยังไม่ได้คิดเงิน VAT — ไว้ใช้ตอนจดทะเบียนแล้ว)
      vat_applicable: isVatApplicable(item.product),
    }))

    await supabase.from('transaction_items').insert(itemInserts)

    await deductStock(supabase, cart, {
      transactionId: tx.id,
      type: 'sale',
      reason: tx.transaction_number,
      createdBy: cashierId,
    })

    // ปิดเวชระเบียนคลินิกที่เพิ่งเก็บเงิน — ผูกกับบิลไว้เพื่อพิมพ์ใบเสร็จซ้ำ/คืนสถานะตอนยกเลิกบิล
    if (visitId) {
      await supabase
        .from('visits')
        .update({ status: 'paid', transaction_id: tx.id })
        .eq('id', visitId)
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
    const pieces = cart.reduce((n, i) => n + i.quantity, 0)
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
          <h2 className="text-lg font-bold text-gray-900 mb-1">{online ? 'บันทึกออเดอร์แล้ว' : 'ชำระเงินสำเร็จ'}</h2>
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
              พิมพ์ใบเสร็จ
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
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white rounded-t-2xl flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">
            {writeoff ? 'ตัดสต็อกออก' : online ? 'บันทึกออเดอร์ออนไลน์' : 'ชำระเงิน'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* ช่องทางขาย — ออนไลน์เงินเข้าผ่านแพลตฟอร์ม ไม่ใช่เงินสดหน้าร้าน */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">ช่องทางขาย</p>
            <div className="grid grid-cols-4 gap-1.5">
              {SALES_CHANNELS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => {
                    setMode('sale')
                    setChannel(c.value)
                    // ขายออนไลน์เงินเข้าบัญชีร้านผ่านแพลตฟอร์ม ตั้งเป็นโอนให้เลย
                    if (isOnlineChannel(c.value) && method === 'cash') setMethod('transfer')
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
            <button
              onClick={() => setMode(writeoff ? 'sale' : 'writeoff')}
              className={`mt-1.5 w-full py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                writeoff
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              ตัดสต็อกออก (ไม่ใช่การขาย)
            </button>
          </div>

          {online && (
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
                {visitId && <> · ใบตรวจรักษาที่ดึงมาจะถูก<b>ปิดโดยไม่คิดเงิน</b></>}
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

          {online && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              ไม่ต้องรับเงินที่ร้าน — ยอดเงินไปเก็บจากแพลตฟอร์มโดยตรง ตรงนี้แค่บันทึกบิลและตัดสต็อก
            </p>
          )}

          {/* Payment Method */}
          <div className={online || writeoff ? 'hidden' : ''}>
            <p className="text-sm font-medium text-gray-700 mb-2">วิธีชำระเงิน</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PAYMENT_LABELS) as Exclude<PaymentMethod, 'qr'>[]).map((m) => (
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
          </div>

          {/* Manual discount */}
          <div className={`bg-orange-50 rounded-lg p-3 ${online || writeoff ? 'hidden' : ''}`}>
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
          {method === 'cash' && !online && !writeoff && (
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
          {!online && !writeoff && customer && pointsConfig && customer.points > 0 && (
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
            {method === 'cash' && cashReceived && change >= 0 && (
              <div className="flex justify-between text-sm text-blue-600 font-medium">
                <span>เงินทอน</span>
                <span>฿{change.toFixed(2)}</span>
              </div>
            )}
            {earnedPoints > 0 && (
              <div className="text-xs text-purple-600 pt-1">
                ได้รับ {earnedPoints} แต้ม
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleConfirm}
            disabled={
              loading ||
              (writeoff && !writeoffReason.trim()) ||
              (!writeoff && !online && method === 'cash' && (!cashReceived || parseFloat(cashReceived) < finalTotal))
            }
            className={`w-full disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-base transition-colors ${
              writeoff ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {loading
              ? 'กำลังบันทึก...'
              : writeoff ? '✓ ตัดสต็อกออก'
                : online ? '✓ บันทึกและตัดสต็อก'
                  : '✓ ยืนยันชำระเงิน'}
          </button>
        </div>
      </div>
    </div>
  )
}
