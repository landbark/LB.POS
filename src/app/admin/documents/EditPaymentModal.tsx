'use client'

import { useState } from 'react'
import { X, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { updatePaymentMethod } from '@/lib/updatePaymentMethod'
import type { PaymentMethod } from '@/lib/types'

interface Props {
  transactionId: string
  transactionNumber: string
  total: number
  currentMethod: PaymentMethod
  currentUserId: string
  onClose: () => void
  onSaved: () => void
}

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'เงินสด' },
  { value: 'transfer', label: 'โอนเงิน' },
  { value: 'card', label: 'บัตรเครดิต' },
  { value: 'qr', label: 'QR Code' },
]

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

export default function EditPaymentModal({
  transactionId,
  transactionNumber,
  total,
  currentMethod,
  currentUserId,
  onClose,
  onSaved,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>(currentMethod)
  const [cashReceived, setCashReceived] = useState(total.toFixed(2))
  const [loading, setLoading] = useState(false)

  const received = parseFloat(cashReceived || '0')
  const change = Math.max(0, received - total)

  async function save() {
    setLoading(true)
    const { error } = await updatePaymentMethod({
      transactionId,
      method,
      cashReceived: method === 'cash' ? received : null,
      editedBy: currentUserId,
    })
    setLoading(false)

    if (error) {
      toast.error(error)
      return
    }
    toast.success('แก้วิธีรับเงินแล้ว')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-blue-500" />
            <h2 className="font-semibold text-gray-900">แก้วิธีรับเงิน {transactionNumber}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            แก้ได้เฉพาะวิธีรับเงิน — ยอดบิล ฿{money(total)} รายการสินค้า สต็อค และแต้มไม่เปลี่ยน
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">รับเงินโดย</label>
            <div className="space-y-1.5">
              {METHOD_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={method === opt.value}
                    onChange={() => setMethod(opt.value)}
                  />
                  {opt.label}
                  {opt.value === currentMethod && <span className="text-xs text-gray-400">(เดิม)</span>}
                </label>
              ))}
            </div>
          </div>

          {method === 'cash' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">รับเงินมา</label>
              <input
                type="number"
                step="0.01"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                {received < total ? (
                  <span className="text-red-500">น้อยกว่ายอดบิล</span>
                ) : (
                  <>เงินทอน ฿{money(change)}</>
                )}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={save}
            disabled={loading || method === currentMethod || (method === 'cash' && received < total)}
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
