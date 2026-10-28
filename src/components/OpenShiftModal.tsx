'use client'

import { useEffect, useState } from 'react'
import { X, Wallet, AlertTriangle, ArrowRightLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { findCarryOver, findOrphanSales, openShift, type CarryOver, type OrphanSales } from '@/lib/shiftOpen'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })

/**
 * เปิดกะได้จากทุกหน้า — หน้าขายเรียกจากแถบเตือน "ยังไม่ได้เปิดกะ" (ไม่ต้องทิ้งตะกร้าไปหน้าอื่น)
 * ถ้าวันนี้ขายไปแล้วตอนไม่มีกะเปิด จะเสนอรวมบิลพวกนั้นเข้ากะนี้ให้ด้วย
 */
export default function OpenShiftModal({
  userId,
  userName,
  onClose,
  onOpened,
}: {
  userId: string
  userName?: string
  onClose: () => void
  /** เปิดกะสำเร็จ — ผู้เรียกไป router.refresh() เอง (แถบเตือน/การ์ดกะจะได้อัปเดต) */
  onOpened: () => void
}) {
  const [cash, setCash] = useState('')
  const [orphan, setOrphan] = useState<OrphanSales | null>(null)
  const [pullIn, setPullIn] = useState(true)
  const [loadingOrphan, setLoadingOrphan] = useState(true)
  // ยอดที่ควรเหลือข้ามคืนจากกะที่แล้ว — เติมใส่ช่องให้ก่อน คนนับได้ไม่ตรงค่อยแก้
  const [carry, setCarry] = useState<CarryOver | null>(null)
  const [carryReason, setCarryReason] = useState('')
  // เงินทอนตั้งต้นคงที่ที่ร้านตั้งไว้ — null = ไม่ได้ตั้ง (ยอดยกมาลอยไปตามที่เหลือจริง)
  const [floatTarget, setFloatTarget] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      findOrphanSales(),
      findCarryOver(),
      createClient().from('store_settings').select('float_target').limit(1).maybeSingle(),
    ]).then(([found, over, store]) => {
      if (cancelled) return
      setOrphan(found)
      setCarry(over)
      setFloatTarget(store.data?.float_target != null ? Number(store.data.float_target) : null)
      if (over) setCash(String(over.amount))
      setLoadingOrphan(false)
    })
    return () => { cancelled = true }
  }, [])

  const typed = parseFloat(cash || '0')
  // ต่างจากยอดยกมาเท่าไหร่ — ค่านี้จะถูกเขียนลง shifts.notes ตอนเปิดกะ
  const carryDiff = carry && !Number.isNaN(typed) ? typed - carry.amount : 0

  async function submit() {
    const amount = parseFloat(cash || '0')
    if (Number.isNaN(amount) || amount < 0) {
      toast.error('กรุณาใส่เงินสดตั้งต้น')
      return
    }
    setBusy(true)
    const { error } = await openShift({
      openingCash: amount,
      openedBy: userId,
      openedByName: userName,
      orphan: pullIn ? orphan : null,
      carry,
      carryReason,
    })
    setBusy(false)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(
      carryDiff !== 0
        ? `เปิดกะแล้ว — บันทึกส่วนต่างจากยอดยกมา ${carryDiff > 0 ? '+' : '−'}฿${money(Math.abs(carryDiff))} ไว้ในกะนี้`
        : pullIn && orphan
          ? `เปิดกะแล้ว — รวมบิลตั้งแต่ ${fmtTime(orphan.firstAt)} เข้ากะนี้`
          : 'เปิดกะแล้ว',
    )
    onOpened()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">เปิดกะ</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เงินสดตั้งต้น (นับเงินในเก๊ะจริง)</label>
            <input
              type="number" min={0} step="0.01" inputMode="decimal" autoFocus
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              placeholder="0.00"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                carryDiff !== 0
                  ? 'border-amber-400 bg-amber-50 focus:ring-amber-400'
                  : 'border-gray-300 focus:ring-[#C4865A]'
              }`}
            />
          </div>

          {carry && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm text-gray-700">
                <ArrowRightLeft size={14} className="shrink-0 text-gray-400" />
                ยอดยกมาจากกะ {fmtDay(carry.closedAt)} <b>฿{money(carry.amount)}</b>
              </p>
              <p className="text-xs text-gray-500">
                ปิดกะ {fmtTime(carry.closedAt)} นับได้ ฿{money(carry.counted)}
                {carry.toOwner > 0 && <> − แยกให้เจ้าของ ฿{money(carry.toOwner)}</>}
              </p>
              {floatTarget != null && (
                <p className={`text-xs ${carry.amount === floatTarget ? 'text-gray-500' : 'text-amber-700 font-medium'}`}>
                  เงินทอนตั้งต้นคงที่ ฿{money(floatTarget)}
                  {carry.amount !== floatTarget && <> — กะที่แล้วเหลือไว้ไม่ตรงยอดนี้ ฿{money(Math.abs(carry.amount - floatTarget))}</>}
                </p>
              )}
              {carryDiff === 0 ? (
                <p className="text-xs text-gray-500">เติมยอดนี้ให้แล้ว — นับเงินในเก๊ะดูก่อน ถ้าไม่เท่ากันให้แก้ตามที่นับได้จริง</p>
              ) : (
                <p className="text-xs font-medium text-amber-800">
                  นับได้{carryDiff > 0 ? 'เกิน' : 'ขาด'}ไป ฿{money(Math.abs(carryDiff))} จากยอดยกมา
                </p>
              )}
            </div>
          )}

          {carryDiff !== 0 && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-900">
                เปิดกะได้เลย ระบบจะใช้ยอดที่นับได้จริงเป็นตั้งต้น และ<b>บันทึกส่วนต่าง ฿{money(Math.abs(carryDiff))} ไว้ในกะนี้</b>{' '}
                เพื่อให้ย้อนดูได้ว่าคืนก่อนนับผิดหรือเงินหายระหว่างคืน
              </p>
              <input
                value={carryReason}
                onChange={(e) => setCarryReason(e.target.value)}
                placeholder="เช่น เมื่อคืนนับเหรียญสิบขาด / เจ้าของมาหยิบเพิ่มตอนดึก"
                className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          )}

          {loadingOrphan && <p className="text-xs text-gray-400">กำลังดูบิลของวันนี้...</p>}

          {orphan && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
              <label className="flex items-start gap-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={pullIn}
                  onChange={(e) => setPullIn(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-amber-600"
                />
                <span>
                  <b>รวมบิลที่ขายไปก่อนเปิดกะ</b> — วันนี้มีบิลหน้าร้าน {orphan.bills} ใบ
                  (เงินสด ฿{money(orphan.cash)}) ที่ขายตอนไม่มีกะเปิด
                </span>
              </label>
              <p className="text-xs text-amber-800">
                {pullIn ? (
                  <>
                    กะนี้จะเริ่มนับตั้งแต่ <b>{fmtTime(orphan.firstAt)}</b> (เวลาบิลแรก) ยอดปิดกะจะได้ตรงกับเงินในเก๊ะ ·
                    เงินสดตั้งต้นให้ใส่เงินในเก๊ะ <b>ก่อน</b> ขายบิลพวกนี้ — ถ้านับตอนนี้ได้เท่าไหร่ ให้หัก ฿{money(orphan.cash)} ออกก่อน
                  </>
                ) : (
                  <>
                    ไม่ติ๊ก = เงินสด ฿{money(orphan.cash)} ก้อนนี้จะไม่อยู่ในกะไหนเลย ตอนปิดกะจะขึ้นว่าเงินเกินเท่ายอดนี้
                  </>
                )}
              </p>
            </div>
          )}

          {!loadingOrphan && !orphan && (
            <p className="flex items-start gap-1.5 text-xs text-gray-500">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-gray-400" />
              วันนี้ยังไม่มีบิลเงินสดที่ขายนอกกะ — เปิดกะได้เลย
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 p-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border-2 border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300"
          >
            ยกเลิก
          </button>
          <button
            onClick={submit}
            disabled={busy || loadingOrphan}
            className="flex-[2] flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#C4865A] hover:bg-[#7A4E2D] disabled:opacity-50 text-sm font-semibold text-white"
          >
            <Wallet size={15} /> {busy ? 'กำลังเปิดกะ...' : 'เปิดกะ'}
          </button>
        </div>
      </div>
    </div>
  )
}
