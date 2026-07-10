'use client'

import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { cancelReceipt } from '@/lib/cancelReceipt'
import type { RefundMethod } from '@/lib/types'

interface Props {
  transactionId: string
  transactionNumber: string
  hasCustomer: boolean
  currentUserId: string
  onClose: () => void
  onCancelled: () => void
}

const REFUND_OPTIONS: { value: RefundMethod; label: string }[] = [
  { value: 'cash', label: 'เงินสด' },
  { value: 'transfer', label: 'โอนเงิน' },
  { value: 'credit', label: 'เก็บเป็นเครดิต (สมาชิกเท่านั้น)' },
]

export default function CancelReceiptModal({
  transactionId,
  transactionNumber,
  hasCustomer,
  currentUserId,
  onClose,
  onCancelled,
}: Props) {
  const [restock, setRestock] = useState(true)
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
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
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 text-sm ${disabled ? 'text-gray-300 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      disabled={disabled}
                      checked={refundMethod === opt.value}
                      onChange={() => setRefundMethod(opt.value)}
                    />
                    {opt.label}
                  </label>
                )
              })}
            </div>
          </div>
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
