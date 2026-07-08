'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { ProductLot } from '@/lib/types'

interface Props {
  productId: string
  lots: ProductLot[]
  unit: string
}

export default function LotManager({ productId, lots, unit }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ lot_number: '', expiry_date: '', quantity: '' })

  async function addLot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase.from('product_lots').insert({
      product_id: productId,
      lot_number: form.lot_number || null,
      expiry_date: form.expiry_date || null,
      quantity: parseInt(form.quantity),
      initial_quantity: parseInt(form.quantity),
    })

    if (error) {
      toast.error('เกิดข้อผิดพลาด')
      setLoading(false)
      return
    }

    toast.success('เพิ่ม lot แล้ว')
    setForm({ lot_number: '', expiry_date: '', quantity: '' })
    setShowForm(false)
    setLoading(false)
    router.refresh()
  }

  async function deleteLot(id: string) {
    if (!confirm('ลบ lot นี้?')) return
    const supabase = createClient()
    await supabase.from('product_lots').delete().eq('id', id)
    toast.success('ลบ lot แล้ว')
    router.refresh()
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Lot / วันหมดอายุ</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          <Plus size={15} />
          เพิ่ม lot
        </button>
      </div>

      {showForm && (
        <form onSubmit={addLot} className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Lot Number</label>
              <input
                type="text"
                value={form.lot_number}
                onChange={(e) => setForm({ ...form, lot_number: e.target.value })}
                className="w-full border border-gray-300 rounded px-2.5 py-2 text-sm"
                placeholder="LOT-001"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">วันหมดอายุ</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                className="w-full border border-gray-300 rounded px-2.5 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">จำนวน ({unit}) *</label>
            <input
              type="number"
              required
              min="1"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="w-full border border-gray-300 rounded px-2.5 py-2 text-sm"
              placeholder="0"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white text-sm py-2 rounded font-medium disabled:opacity-50"
            >
              {loading ? 'บันทึก...' : 'บันทึก'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-2 border border-gray-300 rounded text-sm text-gray-600"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {lots.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">ยังไม่มี lot</p>
        )}
        {lots.map((lot) => {
          const isExpired = lot.expiry_date && lot.expiry_date < today
          const isExpiringSoon = lot.expiry_date && lot.expiry_date >= today &&
            lot.expiry_date <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

          return (
            <div key={lot.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {lot.lot_number || 'ไม่ระบุ lot'}
                </p>
                <p className={`text-xs mt-0.5 ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-orange-500' : 'text-gray-400'}`}>
                  {lot.expiry_date
                    ? `หมดอายุ ${new Date(lot.expiry_date).toLocaleDateString('th-TH')}`
                    : 'ไม่มีวันหมดอายุ'}
                  {isExpired && ' ⚠️ หมดแล้ว'}
                  {isExpiringSoon && ' ⚠️ ใกล้หมด'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">
                  {lot.quantity} {unit}
                </span>
                <button
                  onClick={() => deleteLot(lot.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
