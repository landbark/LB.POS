'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'

/**
 * ปรับจำนวนของล็อตได้จากหน้าสต็อคเลย — เดิมต้องคลิกเข้าหน้าสินค้าทีละตัวถึงจะแก้ได้
 * (LotManager ที่ /admin/products/[id] ยังอยู่ ใช้ตอนอยากเพิ่ม/ลบล็อตหรือแก้วันหมดอายุ)
 *
 * ทุกการปรับลง stock_movements เป็น adjust_in/adjust_out พร้อมเหตุผลและคนทำ
 * เพื่อให้ตามรอยได้ที่ "ประวัติสต็อค" — จึงบังคับให้ใส่เหตุผล
 */

/** เหตุผลที่กดบ่อย — พิมพ์เองก็ได้ ไว้ให้กดเร็วตอนยืนหน้าชั้นของ */
const QUICK_REASONS = ['นับสต็อคใหม่', 'สินค้าเสียหาย', 'หมดอายุ/ทิ้ง', 'ของหาย', 'แถม/ตัวอย่าง']

interface Props {
  lotId: string
  productId: string
  productName: string
  lotNumber: string | null
  expiryDate: string | null
  quantity: number
  unit: string
  userId: string
}

export default function AdjustLotButton({
  lotId,
  productId,
  productName,
  lotNumber,
  expiryDate,
  quantity,
  unit,
  userId,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  // ยอดตั้งต้นที่ใช้คิดส่วนต่าง — ปกติเท่ากับที่หน้าแสดง แต่ถ้ามีคนขายระหว่างที่เปิดกล่องอยู่
  // จะถูกอัปเดตเป็นยอดจริงจาก DB แล้วให้กดยืนยันอีกครั้ง
  const [base, setBase] = useState(quantity)

  function openModal() {
    setBase(quantity)
    setQty(String(quantity))
    setReason('')
    setOpen(true)
  }

  const target = parseInt(qty, 10)
  const valid = !isNaN(target) && target >= 0
  const diff = valid ? target - base : 0

  async function save() {
    if (!valid) {
      toast.error('จำนวนไม่ถูกต้อง')
      return
    }
    if (!reason.trim()) {
      toast.error('ใส่เหตุผลที่ปรับด้วย')
      return
    }
    if (diff === 0) {
      setOpen(false)
      return
    }

    setBusy(true)
    const supabase = createClient()

    // อ่านยอดจริงก่อนเขียน — ถ้าขายไปแล้วระหว่างที่กล่องเปิดอยู่ ยอดที่เห็นจะเก่า
    // เขียนทับไปเลยจะกลายเป็นคืนของที่ขายไปแล้วกลับเข้าสต็อค
    const { data: fresh, error: readErr } = await supabase
      .from('product_lots')
      .select('quantity')
      .eq('id', lotId)
      .single()

    if (readErr || !fresh) {
      toast.error('อ่านยอดล่าสุดไม่สำเร็จ' + (readErr ? ': ' + readErr.message : ''))
      setBusy(false)
      return
    }

    if (fresh.quantity !== base) {
      setBase(fresh.quantity)
      setBusy(false)
      toast.error(`ยอดเปลี่ยนเป็น ${fresh.quantity} ${unit} แล้ว (มีการขาย/ปรับระหว่างนี้) — ตรวจแล้วกดบันทึกอีกครั้ง`)
      return
    }

    const { error } = await supabase.from('product_lots').update({ quantity: target }).eq('id', lotId)
    if (error) {
      toast.error('ปรับสต็อคไม่สำเร็จ: ' + error.message)
      setBusy(false)
      return
    }

    const { error: logErr } = await supabase.from('stock_movements').insert({
      product_id: productId,
      product_lot_id: lotId,
      type: diff > 0 ? 'adjust_in' : 'adjust_out',
      quantity: Math.abs(diff),
      reason: reason.trim(),
      created_by: userId || null,
    })
    // ยอดถูกปรับแล้ว แต่ประวัติหาย — บอกให้รู้ ไม่ใช่เงียบ
    if (logErr) toast.error('ปรับยอดแล้ว แต่บันทึกประวัติไม่สำเร็จ: ' + logErr.message)
    else toast.success(`${diff > 0 ? 'ปรับเพิ่ม' : 'ปรับลด'} ${Math.abs(diff)} ${unit}`)

    setBusy(false)
    setOpen(false)
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'

  return (
    <>
      <button
        onClick={openModal}
        className="text-gray-300 hover:text-blue-600 transition-colors p-1"
        title="ปรับจำนวน"
        aria-label={`ปรับจำนวน ${productName}`}
      >
        <Pencil size={15} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-100">
              <div className="min-w-0">
                <h2 className="font-bold text-gray-900 text-sm truncate">{productName}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Lot {lotNumber || 'ไม่ระบุ'}
                  {expiryDate && ` · หมดอายุ ${new Date(expiryDate).toLocaleDateString('th-TH')}`}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-baseline justify-between">
                <span className="text-xs text-gray-500">ยอดในระบบ</span>
                <span className="text-base font-bold text-gray-900">
                  {base} {unit}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนใหม่ ({unit})</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className={inputClass}
                  autoFocus
                />
                <p className="text-xs mt-1 min-h-4">
                  {!valid ? (
                    <span className="text-red-600">ใส่จำนวนตั้งแต่ 0 ขึ้นไป</span>
                  ) : diff === 0 ? (
                    <span className="text-gray-400">เท่าเดิม</span>
                  ) : (
                    <span className={diff > 0 ? 'text-blue-600 font-medium' : 'text-orange-600 font-medium'}>
                      {diff > 0 ? `ปรับเพิ่ม +${diff}` : `ปรับลด ${diff}`} {unit}
                      {target === 0 && ' · ล็อตนี้จะหมด หายไปจากตารางสต็อค'}
                    </span>
                  )}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผล *</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={inputClass}
                  placeholder="เช่น นับสต็อคใหม่"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {QUICK_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        reason === r
                          ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                บันทึกแล้วจะขึ้นใน “ประวัติสต็อค” พร้อมชื่อคนปรับ
              </p>
            </div>

            <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-gray-100">
              <button
                onClick={save}
                disabled={busy || !valid}
                className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2.5 rounded-lg font-medium disabled:opacity-50"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                {busy ? 'บันทึก...' : 'บันทึก'}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
