'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, CheckCircle2, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CartItem, Customer, PointsConfig, PaymentMethod } from '@/lib/types'
import { POS_DISPLAY_CHANNEL, type PosDisplayMessage } from '@/lib/posDisplay'

interface Props {
  cart: CartItem[]
  subtotal: number
  totalDiscount: number
  total: number
  customer: Customer | null
  pointsConfig: PointsConfig | null
  cashierId: string
  promptpayId: string | null
  onClose: () => void
  onSuccess: () => void
}

// qr ตัดออกจากตัวเลือก — ถือเป็นการโอนเงินแบบเดียวกับ transfer (ยังรองรับอ่านรายการเก่าที่บันทึกเป็น qr ไว้ที่อื่น)
const PAYMENT_LABELS: Record<Exclude<PaymentMethod, 'qr'>, string> = {
  cash: '💵 เงินสด',
  transfer: '📲 โอนเงิน',
  card: '💳 บัตรเครดิต',
}

export default function PaymentModal({
  cart, subtotal, totalDiscount, total, customer, pointsConfig, cashierId, promptpayId, onClose, onSuccess,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [usePoints, setUsePoints] = useState(0)
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
  const finalTotal = Math.max(0, afterManualDiscount - pointsDiscount)

  const change = method === 'cash' && cashReceived
    ? parseFloat(cashReceived) - finalTotal
    : 0

  const earnedPoints = pointsConfig && finalTotal > 0
    ? Math.floor(finalTotal / pointsConfig.spend_amount) * pointsConfig.earn_points
    : 0

  const displayCustomer = customer
    ? { name: customer.name, pointsBefore: customer.points, pointsEarned: earnedPoints, pointsAfter: customer.points + earnedPoints - usePoints }
    : null

  // ส่งสถานะให้จอลูกค้า (จอสอง) ทุกครั้งที่ยอด/วิธีจ่าย/แต้มเปลี่ยน จนกว่าจะบันทึกสำเร็จ
  useEffect(() => {
    if (completedTxId) return
    const msg: PosDisplayMessage = {
      stage: 'payment',
      total: finalTotal,
      method: method as Exclude<PaymentMethod, 'qr'>,
      promptpayId,
      customer: displayCustomer,
    }
    displayChannelRef.current?.postMessage(msg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalTotal, method, promptpayId, customer, earnedPoints, usePoints, completedTxId])

  async function handleConfirm() {
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
          payment_method: method,
          cash_received: method === 'cash' ? parseFloat(cashReceived) : null,
          change_given: method === 'cash' ? Math.max(0, change) : null,
          points_earned: earnedPoints,
          points_used: usePoints,
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
    }))

    await supabase.from('transaction_items').insert(itemInserts)

    // Deduct stock from lots (FEFO)
    for (const item of cart) {
      let remaining = item.quantity
      const lots = (item.product.product_lots ?? [])
        .filter((l: any) => l.quantity > 0)
        .sort((a: any, b: any) => {
          if (!a.expiry_date) return 1
          if (!b.expiry_date) return -1
          return a.expiry_date.localeCompare(b.expiry_date)
        })

      for (const lot of lots) {
        if (remaining <= 0) break
        const deduct = Math.min(remaining, (lot as any).quantity)
        await supabase
          .from('product_lots')
          .update({ quantity: (lot as any).quantity - deduct })
          .eq('id', (lot as any).id)
        await supabase.from('stock_movements').insert({
          product_id: item.product.id,
          product_lot_id: (lot as any).id,
          type: 'sale',
          quantity: deduct,
          reason: tx.transaction_number,
          created_by: cashierId,
        })
        remaining -= deduct
      }
    }

    // Update customer points
    if (customer) {
      await supabase
        .from('customers')
        .update({
          points: customer.points + earnedPoints - usePoints,
          total_spent: customer.total_spent + finalTotal,
        })
        .eq('id', customer.id)
    }

    setLoading(false)
    setCompletedTxId(tx.id)
    displayChannelRef.current?.postMessage({
      stage: 'done',
      total: finalTotal,
      customer: displayCustomer,
    } satisfies PosDisplayMessage)
  }

  if (completedTxId) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
          <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">ชำระเงินสำเร็จ</h2>
          <p className="text-2xl font-bold text-gray-900 mb-1">฿{finalTotal.toFixed(2)}</p>
          {method === 'cash' && change > 0 && (
            <p className="text-sm text-blue-600 mb-4">เงินทอน ฿{change.toFixed(2)}</p>
          )}
          {!(method === 'cash' && change > 0) && <div className="mb-4" />}

          <div className="space-y-2">
            <button
              onClick={onSuccess}
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
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">ชำระเงิน</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Payment Method */}
          <div>
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
          <div className="bg-orange-50 rounded-lg p-3">
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
          {method === 'cash' && (
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
          {customer && pointsConfig && customer.points > 0 && (
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

          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
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
            disabled={loading || (method === 'cash' && (!cashReceived || parseFloat(cashReceived) < finalTotal))}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-base transition-colors"
          >
            {loading ? 'กำลังบันทึก...' : '✓ ยืนยันชำระเงิน'}
          </button>
        </div>
      </div>
    </div>
  )
}
