'use client'

import { useEffect, useState } from 'react'
import { X, Wallet, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { findOrphanSales, openShift, type OrphanSales } from '@/lib/shiftOpen'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })

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
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    findOrphanSales().then((found) => {
      if (cancelled) return
      setOrphan(found)
      setLoadingOrphan(false)
    })
    return () => { cancelled = true }
  }, [])

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
    })
    setBusy(false)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(
      pullIn && orphan
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
            <label className="block text-sm font-medium text-gray-700 mb-1">เงินสดตั้งต้น (เงินทอนในเก๊ะ)</label>
            <input
              type="number" min={0} step="0.01" inputMode="decimal" autoFocus
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4865A]"
            />
          </div>

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
