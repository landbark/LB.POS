'use client'

import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { cancelReceipt } from '@/lib/cancelReceipt'
import { PAYMENT_BADGE, PAYMENT_LABEL } from '@/lib/payments'
import { REFUND_OPTIONS, isRefundMismatch, refundMismatchWarning, suggestedRefundMethod } from '@/lib/refunds'
import type { PaymentMethod, RefundMethod } from '@/lib/types'

interface Props {
  transactionId: string
  transactionNumber: string
  total: number
  /** วิธีที่ลูกค้าจ่ายเงินมา — ตั้งช่องทางคืนให้ตรงกันไว้ก่อน คนกดไม่ต้องเดา */
  paymentMethod: PaymentMethod
  /** บิลแยกจ่ายหลายทาง — เดาช่องทางคืนให้ไม่ได้ ต้องเลือกเอง */
  splitPayment?: boolean
  hasCustomer: boolean
  currentUserId: string
  onClose: () => void
  onCancelled: () => void
}

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

export default function CancelReceiptModal({
  transactionId,
  transactionNumber,
  total,
  paymentMethod,
  splitPayment = false,
  hasCustomer,
  currentUserId,
  onClose,
  onCancelled,
}: Props) {
  const [restock, setRestock] = useState(true)
  // ตั้งต้นเป็นช่องทางเดียวกับที่รับเงินมา — ของเดิมตั้งเป็นเงินสดไว้เสมอ บิลบัตร/QR
  // จึงถูกกดคืนเป็นเงินสดทั้งที่เงินไม่ได้ออกจากเก๊ะ แล้วสรุปกะเพี้ยนทั้งกะ
  const [refundMethod, setRefundMethod] = useState<RefundMethod>(suggestedRefundMethod(paymentMethod))
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  // บิลแยกจ่ายไม่มีช่องทางเดียวให้เทียบ เตือนไปก็เตือนผิด
  const mismatch = !splitPayment && isRefundMismatch(paymentMethod, refundMethod)

  async function confirm() {
    setLoading(true)
    const { error } = await cancelReceipt({
      transactionId,
      restock,
      refundMethod,
      reason,
      cancelledBy: currentUserId,
    })
    setLoading(false)

    if (error) {
      toast.error(error)
      return
    }
    toast.success('ยกเลิกใบเสร็จแล้ว')
    onCancelled()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" />
            <h2 className="font-semibold text-gray-900">ยกเลิกใบเสร็จ {transactionNumber}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* ลูกค้าจ่ายมาทางไหน — ต้องเห็นก่อนเลือกช่องทางคืน ไม่ใช่ต้องจำหรือย้อนไปเปิดบิลดู */}
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
            <div className="flex items-center justify-between gap-3 mt-1">
              <span className="text-gray-500">ยอดบิล</span>
              <span className="font-medium text-gray-900 tabular-nums">฿{money(total)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">เหตุผล (ถ้ามี)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ลูกค้าเปลี่ยนใจ, สินค้าเสียหาย"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">คืนสต็อคสินค้ากลับหรือไม่?</label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={restock} onChange={() => setRestock(true)} />
                เพิ่มสต็อคกลับ
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={!restock} onChange={() => setRestock(false)} />
                ไม่เพิ่มสต็อค (กรณีของเสีย/เสียหาย)
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">คืนเงินโดย</label>
            <div className="space-y-1.5">
              {REFUND_OPTIONS.map((opt) => {
                const disabled = opt.value === 'credit' && !hasCustomer
                const suggested = !splitPayment && opt.value === paymentMethod
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-2 text-sm ${disabled ? 'text-gray-300 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      disabled={disabled}
                      checked={refundMethod === opt.value}
                      onChange={() => setRefundMethod(opt.value)}
                      className="mt-1"
                    />
                    <span>
                      {opt.label}
                      {suggested && <span className="ml-1 text-xs text-emerald-600 font-medium">(ตรงกับที่จ่ายมา)</span>}
                      {opt.hint && <span className={`block text-xs ${disabled ? 'text-gray-300' : 'text-gray-400'}`}>{opt.hint}</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* คืนคนละทางกับที่รับมาได้ (ลูกค้าขอรับสดแทนก็มี) แต่ต้องเห็นเตือนก่อนกดยืนยัน */}
          {mismatch && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              {refundMismatchWarning(paymentMethod, refundMethod)}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={confirm}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {loading ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกใบเสร็จ'}
          </button>
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg">
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}
