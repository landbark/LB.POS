'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/lib/confirm'
import DateField from '@/components/DateField'

/**
 * แก้ล็อตได้จากหน้าสต็อคเลย — จำนวน / เลข LOT / วันหมดอายุ / ยกเลิกล็อตทั้งก้อน
 * เดิมต้องคลิกเข้าหน้าสินค้าทีละตัวถึงจะเจอ LotManager (ที่นั่นยังอยู่ ใช้ตอนอยากเพิ่มล็อตใหม่)
 *
 * การเปลี่ยนจำนวนลง stock_movements เป็น adjust_in/adjust_out พร้อมเหตุผลและคนทำ
 * เพื่อให้ตามรอยได้ที่ "ประวัติสต็อค" — จึงบังคับให้ใส่เหตุผล
 * แก้เลข LOT/วันหมดอายุไม่ลงประวัติ เพราะของเท่าเดิม แค่เพิ่งรู้ว่าหมดอายุเมื่อไหร่
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

export default function EditLotButton({
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
  const [lotNo, setLotNo] = useState('')
  const [expiry, setExpiry] = useState('')
  // ยอดตั้งต้นที่ใช้คิดส่วนต่าง — ปกติเท่ากับที่หน้าแสดง แต่ถ้ามีคนขายระหว่างที่เปิดกล่องอยู่
  // จะถูกอัปเดตเป็นยอดจริงจาก DB แล้วให้กดยืนยันอีกครั้ง
  const [base, setBase] = useState(quantity)

  function openModal() {
    setBase(quantity)
    setQty(String(quantity))
    setReason('')
    setLotNo(lotNumber ?? '')
    setExpiry(expiryDate ?? '')
    setOpen(true)
  }

  const target = parseInt(qty, 10)
  const validQty = !isNaN(target) && target >= 0
  const diff = validQty ? target - base : 0
  const nextLotNo = lotNo.trim() || null
  const nextExpiry = expiry || null
  const detailsChanged = nextLotNo !== (lotNumber ?? null) || nextExpiry !== (expiryDate ?? null)

  /** ยอดล่าสุดจาก DB — ยอดที่หน้าแสดงเก่าได้ถ้ามีคนขายระหว่างที่กล่องเปิดค้างอยู่ */
  async function freshQuantity(supabase: ReturnType<typeof createClient>) {
    const { data, error } = await supabase.from('product_lots').select('quantity').eq('id', lotId).single()
    if (error || !data) {
      toast.error('อ่านยอดล่าสุดไม่สำเร็จ' + (error ? ': ' + error.message : ''))
      return null
    }
    return data.quantity as number
  }

  async function save() {
    if (!validQty) {
      toast.error('จำนวนไม่ถูกต้อง')
      return
    }
    if (diff !== 0 && !reason.trim()) {
      toast.error('ใส่เหตุผลที่ปรับจำนวนด้วย')
      return
    }
    if (diff === 0 && !detailsChanged) {
      setOpen(false)
      return
    }

    setBusy(true)
    const supabase = createClient()

    if (detailsChanged) {
      const { error } = await supabase
        .from('product_lots')
        .update({ lot_number: nextLotNo, expiry_date: nextExpiry })
        .eq('id', lotId)
      if (error) {
        toast.error('แก้ LOT/วันหมดอายุไม่สำเร็จ: ' + error.message)
        setBusy(false)
        return
      }
    }

    if (diff !== 0) {
      // เขียนทับยอดเก่าไปเลยจะกลายเป็นคืนของที่ขายไปแล้วกลับเข้าสต็อค — ตรวจก่อน
      const current = await freshQuantity(supabase)
      if (current === null) {
        setBusy(false)
        return
      }
      if (current !== base) {
        setBase(current)
        setBusy(false)
        toast.error(`ยอดเปลี่ยนเป็น ${current} ${unit} แล้ว (มีการขาย/ปรับระหว่างนี้) — ตรวจแล้วกดบันทึกอีกครั้ง`)
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
    } else {
      toast.success('แก้ล็อตแล้ว')
    }

    setBusy(false)
    setOpen(false)
    router.refresh()
  }

  async function voidLot() {
    const supabase = createClient()

    // ของที่เหลือจริงตอนนี้ ไม่ใช่ยอดที่หน้าแสดงไว้ — เลขที่ลงประวัติต้องตรงกับของที่หายไปจริง
    const current = await freshQuantity(supabase)
    if (current === null) return

    // แถวใบนับที่ชี้ล็อตนี้ถูกลบตามไปด้วย (FK ตั้งเป็น CASCADE) — ถ้ายังมีรอบที่นับค้างอยู่
    // ต้องบอกก่อน ไม่ใช่ให้ของที่นับไว้หายเงียบ ๆ
    const { data: openCounts } = await supabase
      .from('stock_count_items')
      .select('stock_counts!inner(count_number, status)')
      .eq('product_lot_id', lotId)
      .eq('stock_counts.status', 'counting')
    const countWarning = (openCounts?.length ?? 0) > 0
      ? `\n\n⚠️ ล็อตนี้ถูกนับไว้ในรอบนับที่ยังไม่ปิด ${openCounts!.length} รอบ — แถวที่นับไว้จะถูกลบไปด้วย`
      : ''

    const { confirmed, value } = await confirmDialog({
      title: 'ยกเลิกล็อตนี้?',
      message:
        `${productName}\nLot ${lotNumber || 'ไม่ระบุ'}` +
        (current > 0
          ? `\n\nของที่เหลือ ${current} ${unit} จะถูกตัดออกจากสต็อคทั้งหมด และล็อตนี้จะหายไปจากระบบ`
          : '\n\nล็อตนี้ไม่มีของเหลือแล้ว จะถูกลบออกจากระบบ') +
        countWarning,
      confirmLabel: 'ยกเลิกล็อต',
      tone: 'danger',
      reasonLabel: 'เหตุผล',
      reasonPlaceholder: 'เช่น หมดอายุ ทิ้งไปแล้ว',
      reasonRequired: current > 0,
    })
    if (!confirmed) return

    setBusy(true)
    const note = value.trim()

    // ลงประวัติก่อนลบ — ลบแล้ว FK จะอ้างอิงล็อตนี้ไม่ได้อีก (product_lot_id จึงเป็น null)
    if (current > 0) {
      const { error: logErr } = await supabase.from('stock_movements').insert({
        product_id: productId,
        product_lot_id: null,
        type: 'adjust_out',
        quantity: current,
        reason: `ยกเลิกล็อต${lotNumber ? ` (${lotNumber})` : ''}${note ? `: ${note}` : ''}`,
        created_by: userId || null,
      })
      // ประวัติลงไม่ได้ = ของจะหายไปจากสต็อคแบบไม่มีใครตามได้ ไม่ลบต่อดีกว่า
      if (logErr) {
        toast.error('บันทึกประวัติไม่สำเร็จ ยังไม่ได้ลบล็อต: ' + logErr.message)
        setBusy(false)
        return
      }
    }

    const { error } = await supabase.from('product_lots').delete().eq('id', lotId)
    if (error) {
      toast.error('ลบล็อตไม่สำเร็จ: ' + error.message)
      setBusy(false)
      return
    }

    toast.success(current > 0 ? `ยกเลิกล็อตแล้ว ตัดออก ${current} ${unit}` : 'ลบล็อตแล้ว')
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
        title="แก้ล็อต / ปรับจำนวน"
        aria-label={`แก้ล็อต ${productName}`}
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
                  {!validQty ? (
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เลข LOT</label>
                  <input
                    type="text"
                    value={lotNo}
                    onChange={(e) => setLotNo(e.target.value)}
                    className={inputClass}
                    placeholder="ไม่ระบุ"
                  />
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">วันหมดอายุ</label>
                    {expiry && (
                      <button
                        type="button"
                        onClick={() => setExpiry('')}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        ล้าง
                      </button>
                    )}
                  </div>
                  <DateField
                    value={expiry}
                    onChange={setExpiry}
                    className={inputClass}
                    aria-label="วันหมดอายุ"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เหตุผล {diff !== 0 && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={inputClass}
                  placeholder={diff === 0 ? 'ใส่เมื่อแก้จำนวน' : 'เช่น นับสต็อคใหม่'}
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
                จำนวนที่เปลี่ยนจะขึ้นใน “ประวัติสต็อค” พร้อมชื่อคนปรับ — แก้ LOT/วันหมดอายุไม่ลงประวัติ
              </p>

              <div className="pt-1 border-t border-gray-100">
                <button
                  type="button"
                  onClick={voidLot}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50 pt-2"
                >
                  <Trash2 size={14} /> ยกเลิกล็อตนี้ (ตัดของที่เหลือออกทั้งหมด)
                </button>
              </div>
            </div>

            <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-gray-100">
              <button
                onClick={save}
                disabled={busy || !validQty}
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
