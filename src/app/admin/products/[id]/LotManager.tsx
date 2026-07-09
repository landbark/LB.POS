'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import type { ProductLot } from '@/lib/types'

interface Props {
  productId: string
  lots: ProductLot[]
  unit: string
  userId: string
}

export default function LotManager({ productId, lots, unit, userId }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ lot_number: '', expiry_date: '', quantity: '' })
  // lot id ที่กำลังแก้ไขจำนวนอยู่ — null = ไม่มี
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editReason, setEditReason] = useState('')
  // แก้ไขยอดรวมทั้งหมด (ส่วนต่างจะลง/ตัดที่ lot ใกล้หมดอายุที่สุด)
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalQty, setTotalQty] = useState('')
  const [totalReason, setTotalReason] = useState('')

  async function addLot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const qty = parseInt(form.quantity)
    const { data: newLot, error } = await supabase
      .from('product_lots')
      .insert({
        product_id: productId,
        lot_number: form.lot_number || null,
        expiry_date: form.expiry_date || null,
        quantity: qty,
        initial_quantity: qty,
      })
      .select('id')
      .single()

    if (error || !newLot) {
      toast.error('เกิดข้อผิดพลาด')
      setLoading(false)
      return
    }

    await supabase.from('stock_movements').insert({
      product_id: productId,
      product_lot_id: newLot.id,
      type: 'adjust_in',
      quantity: qty,
      reason: `เพิ่ม lot ใหม่${form.lot_number ? ` (${form.lot_number})` : ''}`,
      created_by: userId || null,
    })

    toast.success('เพิ่ม lot แล้ว')
    setForm({ lot_number: '', expiry_date: '', quantity: '' })
    setShowForm(false)
    setLoading(false)
    router.refresh()
  }

  async function deleteLot(lot: ProductLot) {
    if (!confirm('ลบ lot นี้?')) return
    const supabase = createClient()

    // log ก่อนลบ เพราะลบแล้ว FK จะอ้างอิง lot นี้ไม่ได้อีก
    if (lot.quantity > 0) {
      await supabase.from('stock_movements').insert({
        product_id: productId,
        product_lot_id: null,
        type: 'adjust_out',
        quantity: lot.quantity,
        reason: `ลบ lot${lot.lot_number ? ` (${lot.lot_number})` : ''}`,
        created_by: userId || null,
      })
    }

    await supabase.from('product_lots').delete().eq('id', lot.id)
    toast.success('ลบ lot แล้ว')
    router.refresh()
  }

  function startEdit(lot: ProductLot) {
    setEditingId(lot.id)
    setEditQty(lot.quantity.toString())
    setEditReason('')
  }

  async function adjustLotQuantity(lot: ProductLot, newQty: number, reason: string) {
    const diff = newQty - lot.quantity
    if (diff === 0) return true

    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase.from('product_lots').update({ quantity: newQty }).eq('id', lot.id)
    if (error) {
      toast.error('ปรับสต็อคไม่สำเร็จ: ' + error.message)
      setLoading(false)
      return false
    }

    await supabase.from('stock_movements').insert({
      product_id: productId,
      product_lot_id: lot.id,
      type: diff > 0 ? 'adjust_in' : 'adjust_out',
      quantity: Math.abs(diff),
      reason: reason.trim() || null,
      created_by: userId || null,
    })

    setLoading(false)
    return true
  }

  async function saveEdit(lot: ProductLot) {
    const newQty = parseInt(editQty)
    if (isNaN(newQty) || newQty < 0) {
      toast.error('จำนวนไม่ถูกต้อง')
      return
    }
    const ok = await adjustLotQuantity(lot, newQty, editReason)
    if (!ok) return
    toast.success('ปรับสต็อคแล้ว')
    setEditingId(null)
    router.refresh()
  }

  // เลือก lot ที่ใกล้หมดอายุที่สุดเป็นเป้าหมายของการปรับยอดรวม (ไม่มีวันหมดอายุ = ไปอยู่ท้ายสุด)
  const fefoLot = [...lots].sort((a, b) => {
    if (!a.expiry_date && !b.expiry_date) return 0
    if (!a.expiry_date) return 1
    if (!b.expiry_date) return -1
    return a.expiry_date.localeCompare(b.expiry_date)
  })[0]

  const totalStock = lots.reduce((sum, l) => sum + l.quantity, 0)

  function startEditTotal() {
    setEditingTotal(true)
    setTotalQty(totalStock.toString())
    setTotalReason('')
  }

  async function saveTotalEdit() {
    const newTotal = parseInt(totalQty)
    if (isNaN(newTotal) || newTotal < 0) {
      toast.error('จำนวนไม่ถูกต้อง')
      return
    }
    const diff = newTotal - totalStock
    if (diff === 0) {
      setEditingTotal(false)
      return
    }
    if (!fefoLot) {
      toast.error('ยังไม่มี lot ให้ปรับ — กด "เพิ่ม lot" ก่อน')
      return
    }
    const newLotQty = fefoLot.quantity + diff
    if (newLotQty < 0) {
      toast.error(`ลดได้ไม่เกิน ${fefoLot.quantity} (จำนวนใน lot ใกล้หมดอายุที่สุด) — ปรับทีละ lot แทน`)
      return
    }

    const ok = await adjustLotQuantity(fefoLot, newLotQty, totalReason)
    if (!ok) return
    toast.success('ปรับสต็อคแล้ว')
    setEditingTotal(false)
    router.refresh()
  }

  const today = new Date().toISOString().split('T')[0]
  const inputClass = 'w-full border border-gray-300 rounded px-2.5 py-2 text-sm'

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

      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        {!editingTotal ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">ยอดรวมทั้งหมด</p>
              <p className="text-lg font-bold text-gray-900">{totalStock} {unit}</p>
            </div>
            <button
              onClick={startEditTotal}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Pencil size={14} />
              ปรับยอด
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">ยอดรวมใหม่</label>
              <input
                type="number"
                min="0"
                value={totalQty}
                onChange={(e) => setTotalQty(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </div>
            <input
              type="text"
              value={totalReason}
              onChange={(e) => setTotalReason(e.target.value)}
              className={inputClass}
              placeholder="เหตุผล เช่น นับสต็อคใหม่ / สินค้าเสียหาย (ไม่บังคับ)"
            />
            <p className="text-xs text-gray-400">
              ส่วนต่างจะลง/ตัดที่ lot ใกล้หมดอายุที่สุด{fefoLot?.lot_number ? ` (${fefoLot.lot_number})` : ''}
            </p>
            <div className="flex gap-2">
              <button
                onClick={saveTotalEdit}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white text-sm py-1.5 rounded font-medium disabled:opacity-50"
              >
                บันทึก
              </button>
              <button
                onClick={() => setEditingTotal(false)}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
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
                className={inputClass}
                placeholder="LOT-001"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">วันหมดอายุ</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                className={inputClass}
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
              className={inputClass}
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
          // สินค้าขายหมดแล้ว (quantity = 0) ไม่ต้องเตือนเรื่องวันหมดอายุ
          const soldOut = lot.quantity === 0
          const isExpired = !soldOut && lot.expiry_date && lot.expiry_date < today
          const isExpiringSoon = !soldOut && lot.expiry_date && lot.expiry_date >= today &&
            lot.expiry_date <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          const isEditing = editingId === lot.id

          return (
            <div key={lot.id} className="py-2 border-b border-gray-50 last:border-0">
              <div className="flex items-center justify-between">
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
                  {!isEditing && (
                    <span className="text-sm font-semibold text-gray-900">
                      {lot.quantity} {unit}
                    </span>
                  )}
                  <button
                    onClick={() => (isEditing ? setEditingId(null) : startEdit(lot))}
                    className="text-gray-300 hover:text-blue-500 transition-colors"
                    title="แก้ไขจำนวน"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteLot(lot)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    title="ลบ lot"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="bg-gray-50 rounded-lg p-3 mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 shrink-0">จำนวนใหม่</label>
                    <input
                      type="number"
                      min="0"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className={inputClass}
                      autoFocus
                    />
                  </div>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className={inputClass}
                    placeholder="เหตุผล เช่น นับสต็อคใหม่ / สินค้าเสียหาย (ไม่บังคับ)"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(lot)}
                      disabled={loading}
                      className="flex-1 bg-blue-600 text-white text-sm py-1.5 rounded font-medium disabled:opacity-50"
                    >
                      บันทึก
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
