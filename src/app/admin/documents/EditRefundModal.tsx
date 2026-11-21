'use client'

import { useState } from 'react'
import { X, Banknote } from 'lucide-react'
import toast from 'react-hot-toast'
import { updateRefundMethod } from '@/lib/updateRefundMethod'
import { PAYMENT_BADGE, PAYMENT_LABEL } from '@/lib/payments'
import { REFUND_OPTIONS, isRefundMismatch, refundMismatchWarning } from '@/lib/refunds'
import type { PaymentMethod, RefundMethod } from '@/lib/types'

interface Props {
  transactionId: string
  transactionNumber: string
  total: number
  paymentMethod: PaymentMethod
  splitPayment?: boolean
  currentMethod: RefundMethod | null
  hasCustomer: boolean
  currentUserId: string
  onClose: () => void
  onSaved: () => void
}

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * แก้ช่องทางคืนเงินของบิลที่ยกเลิกไปแล้ว — เปิดให้เฉพาะเจ้าของร้าน (role = admin)
 * เพราะมันขยับทั้งยอดเงินในเก๊ะที่สรุปกะคาดไว้ และเครดิตในกระเป๋าลูกค้า
 */
export default function EditRefundModal({
  transactionId,
  transactionNumber,
  total,
  paymentMethod,
  splitPayment = false,
  currentMethod,
  hasCustomer,
  currentUserId,
  onClose,
  onSaved,
}: Props) {
  const [method, setMethod] = useState<RefundMethod>(currentMethod ?? 'cash')
  const [loading, setLoading] = useState(false)

  const mismatch = !splitPayment && isRefundMismatch(paymentMethod, method)
  const creditMoves = method === 'credit' || currentMethod === 'credit'

  async function save() {
    setLoading(true)
    const { error } = await updateRefundMethod({ transactionId, method, editedBy: currentUserId })
    setLoading(false)

    if (error) {
      toast.error(error)
      return
    }
    toast.success('แก้ช่องทางคืนเงินแล้ว')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Banknote size={18} className="text-blue-500" />
            <h2 className="font-semibold text-gray-900">แก้ช่องทางคืนเงิน {transactionNumber}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            แก้ได้เฉพาะช่องทางที่คืนเงินให้ลูกค้า — ยอดบิล ฿{money(total)} รายการสินค้า สต็อค และแต้มไม่เปลี่ยน
          </p>

          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-500">ลูกค้าจ่ายมาเป็น</span>
              {splitPayment ? (
                <span className="font-medium text-gray-900">แยกจ่ายหลายทาง</span>
              ) : (
                <span className={`inline-flex items-center whitespace-nowrap text-xs px-2 py-0.5 rounded-full font-medium ${PAYMENT_BADGE[paymentMethod]}`}>
                  {PAYMENT_LABEL[paymentMethod] ?? paymentMethod}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">คืนเงินจริงทางไหน</label>
            <div className="space-y-1.5">
              {REFUND_OPTIONS.map((opt) => {
                const disabled = opt.value === 'credit' && !hasCustomer
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-2 text-sm ${disabled ? 'text-gray-300 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      disabled={disabled}
                      checked={method === opt.value}
                      onChange={() => setMethod(opt.value)}
                      className="mt-1"
                    />
                    <span>
                      {opt.label}
                      {opt.value === currentMethod && <span className="ml-1 text-xs text-gray-400">(ที่กดไว้)</span>}
                      {!splitPayment && opt.value === paymentMethod && (
                        <span className="ml-1 text-xs text-emerald-600 font-medium">(ตรงกับที่จ่ายมา)</span>
                      )}
                      {opt.hint && <span className={`block text-xs ${disabled ? 'text-gray-300' : 'text-gray-400'}`}>{opt.hint}</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {mismatch && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              {refundMismatchWarning(paymentMethod, method)}
            </div>
          )}

          {creditMoves && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
              {method === 'credit'
                ? `จะเพิ่มเครดิต ฿${money(total)} เข้ากระเป๋าลูกค้า`
                : `จะหักเครดิต ฿${money(total)} ที่เคยให้ไว้ออกจากกระเป๋าลูกค้า — ถ้าลูกค้าใช้ไปแล้วจนไม่พอ ระบบจะไม่ให้แก้`}
            </div>
          )}

          <p className="text-xs text-gray-400">
            การแก้นี้มีผลกับสรุปกะที่ยังเปิดอยู่ · กะที่ปิดไปแล้วตัวเลขถูกบันทึกตายตัวแล้ว ไม่เปลี่ยนย้อนหลัง
          </p>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={save}
            disabled={loading || method === currentMethod}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {loading ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg">
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}
