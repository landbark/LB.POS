'use client'

import { useEffect, useState } from 'react'
import { X, Wallet, AlertTriangle, ArrowRightLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { BANKNOTES, COINS, DENOMS } from '@/lib/shiftFloat'
import { findCarryOver, findOrphanSales, openShift, type CarryOver, type OrphanSales } from '@/lib/shiftOpen'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })
/** เวลาพร้อมวันถ้าไม่ใช่วันนี้ — บิลหลังปิดกะเป็นของเมื่อคืน เขียนเวลาเปล่าแล้วอ่านผิดว่าเพิ่งขาย */
const fmtWhen = (iso: string) => {
  const dayOf = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  return dayOf(iso) === dayOf(new Date()) ? fmtTime(iso) : `${fmtDay(iso)} ${fmtTime(iso)}`
}

/**
 * เปิดกะได้จากทุกหน้า — หน้าขายเรียกจากแถบเตือน "ยังไม่ได้เปิดกะ" (ไม่ต้องทิ้งตะกร้าไปหน้าอื่น)
 * ถ้าวันนี้ขายไปแล้วตอนไม่มีกะเปิด จะเสนอรวมบิลพวกนั้นเข้ากะนี้ให้ด้วย
 *
 * เทียบกับกะที่แล้วด้วยยอดรวมอย่างเดียว ไม่เทียบรายกอง — ชุดเงินทอนที่วางลงเก๊ะแต่ละคืน
 * แบงค์/เหรียญไม่เหมือนกัน ยอดรวมเท่านั้นที่ต้องตรง
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
  // นับแยกใบ/เหรียญ (ค่าเริ่มต้น) หรือใส่ยอดรวมก้อนเดียว
  const [byDenom, setByDenom] = useState(true)
  const [counts, setCounts] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      findOrphanSales(),
      findCarryOver(),
    ]).then(([found, over]) => {
      if (cancelled) return
      setOrphan(found)
      // ช่วงที่ค้างมานานกว่าวันครึ่ง = ไม่ใช่ "ลูกค้ามาเพิ่มตอนปิดกะ" แล้ว (ลืมเปิดกะมาหลายวัน/
      // เจ้าของมารับเงินไปแล้วก็ได้) ไม่ติ๊กให้เอง ให้คนเปิดกะอ่านแล้วตัดสินใจ
      if (found && found.hours > 36) setPullIn(false)
      setCarry(over)
      if (over) setCash(String(over.amount))
      setLoadingOrphan(false)
    })
    return () => { cancelled = true }
  }, [])

  const qtyOf = (v: number) => parseInt(counts[v] || '0', 10) || 0
  const countedDenoms: Record<number, number> = Object.fromEntries(DENOMS.map((d) => [d.value, qtyOf(d.value)]))
  const denomTotal = DENOMS.reduce((s, d) => s + d.value * qtyOf(d.value), 0)
  const typed = byDenom ? denomTotal : parseFloat(cash || '0')
  // เงินสดสุทธิจากบิลที่ยังไม่เข้ากะ — อยู่ในเก๊ะที่กำลังนับอยู่นี่แล้ว ทั้งกรณีรวมและไม่รวมเข้ากะ
  const pending = orphan ? orphan.net : 0
  // เงินในเก๊ะเช้านี้ควรมีเท่าไหร่ = ยกมาจากกะที่แล้ว + บิลที่ขายหลังปิดกะ
  const shouldCount = carry ? carry.amount + pending : null
  // ต่างจากที่ควรมีเท่าไหร่ — ค่านี้จะถูกเขียนลง shifts.notes ตอนเปิดกะ
  // ยังไม่ได้กรอกอะไรเลย = ยังเทียบไม่ได้ ไม่ใช่เงินขาดทั้งก้อน
  const hasCount = !byDenom || DENOMS.some((d) => (counts[d.value] ?? '') !== '')
  const carryDiff = hasCount && shouldCount != null && !Number.isNaN(typed) ? typed - shouldCount : 0
  // ยอดตั้งต้นที่จะถูกบันทึกจริง — รวมบิลเข้ากะแล้วต้องหักเงินก้อนนั้นออก ไม่งั้นนับสองรอบ
  const openingStored = pullIn && orphan ? typed - pending : typed

  async function submit() {
    if (!hasCount) {
      toast.error('นับเงินในเก๊ะก่อน (ไม่มีเงินให้ใส่ 0)')
      return
    }
    const amount = byDenom ? denomTotal : parseFloat(cash || '0')
    if (Number.isNaN(amount) || amount < 0) {
      toast.error('กรุณาใส่เงินสดตั้งต้น')
      return
    }
    setBusy(true)
    const { error, shiftId, mismatch } = await openShift({
      openingCash: amount,
      openedBy: userId,
      openedByName: userName,
      orphan,
      pullIn,
      carry,
      carryReason,
      openingDenoms: byDenom ? countedDenoms : null,
    })
    setBusy(false)
    if (error) {
      toast.error(error)
      return
    }
    // เงินในเก๊ะไม่ตรงกับที่กะเมื่อวานเหลือไว้ — เด้งบอกเจ้าของเดี๋ยวนี้ ไม่ใช่ปล่อยไว้ใน notes
    // ให้ไปเจอตอนย้อนดูทีหลัง (ล้มเหลวก็ไม่เป็นไร กะเปิดไปแล้ว ส่วนต่างบันทึกลงกะแล้ว)
    if (shiftId && mismatch) {
      fetch('/api/notify/shift-opened', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId, mismatch }),
      }).catch(() => {})
    }
    toast.success(
      carryDiff !== 0
        ? `เปิดกะแล้ว — บันทึกส่วนต่างจากที่ควรมี ${carryDiff > 0 ? '+' : '−'}฿${money(Math.abs(carryDiff))} ไว้ในกะนี้`
        : pullIn && orphan
          ? `เปิดกะแล้ว — ยกบิลตั้งแต่ ${fmtWhen(orphan.firstAt)} มารวมกะนี้ · ตั้งต้น ฿${money(openingStored)}`
          : 'เปิดกะแล้ว',
    )
    onOpened()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">เปิดกะ</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">เงินสดตั้งต้น (นับเงินในเก๊ะจริง)</label>
              <button
                type="button"
                onClick={() => {
                  if (byDenom && hasCount) setCash(String(denomTotal))
                  setByDenom((v) => !v)
                }}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {byDenom ? 'ใส่ยอดรวมแทน' : 'นับแยกใบ/เหรียญ'}
              </button>
            </div>

            {byDenom ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
                  {[BANKNOTES, COINS].map((group, gi) => (
                    <div key={gi} className="space-y-1.5">
                      {group.map((d) => {
                        const qty = qtyOf(d.value)
                        return (
                          <div key={d.value} className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 w-[5.5rem] shrink-0">{d.label}</span>
                            <input
                              type="number" min={0} step={1} inputMode="numeric"
                              value={counts[d.value] ?? ''}
                              onChange={(e) => setCounts((c) => ({ ...c, [d.value]: e.target.value }))}
                              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#C4865A]"
                              placeholder="0"
                            />
                            <span className={`text-sm text-right flex-1 tabular-nums ${qty > 0 ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                              ฿{(d.value * qty).toLocaleString('th-TH')}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                <p className={`mt-2 text-sm font-bold ${carryDiff !== 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                  รวมนับได้ ฿{money(denomTotal)}
                </p>
              </>
            ) : (
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
            )}
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
                {carry.toOwner < 0 && <> + เจ้าของเติมเข้า ฿{money(-carry.toOwner)}</>}
              </p>
              {carry.adjustedAt && (
                <p className="text-xs text-[#7A4E2D]">
                  เจ้าของจัดเงินทอนหลังปิดกะแล้วเมื่อ {fmtTime(carry.adjustedAt)} — ยอดยกมาข้างบนคิดจากใบนับหลังจัด
                </p>
              )}
              {pending !== 0 && (
                <p className="text-xs text-[#7A4E2D]">
                  + ขายหลังปิดกะอีก ฿{money(pending)} (เงินอยู่ในเก๊ะแล้ว) ·{' '}
                  <b>เช้านี้ควรนับได้ ฿{money(shouldCount ?? 0)}</b>
                </p>
              )}
              {!hasCount ? (
                <p className="text-xs text-gray-500">นับเงินในเก๊ะแล้วใส่จำนวน — ยอดรวมตรงก็พอ แบงค์/เหรียญชนิดไหนกี่ใบก็ได้</p>
              ) : carryDiff === 0 ? (
                <p className="text-xs font-medium text-green-600">ยอดรวมตรงกับที่ควรมี</p>
              ) : (
                <p className="text-xs font-medium text-amber-800">
                  นับได้{carryDiff > 0 ? 'เกิน' : 'ขาด'}ไป ฿{money(Math.abs(carryDiff))} จาก
                  {pending !== 0 ? 'ยอดที่ควรมี' : 'ยอดยกมา'}
                </p>
              )}
            </div>
          )}

          {carryDiff !== 0 && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-900">
                เปิดกะได้เลย ระบบจะใช้ยอดที่นับได้จริงเป็นตั้งต้น
                {pullIn && orphan && <> (หักบิลที่ยกมารวม ฿{money(pending)} ออกแล้วเหลือ ฿{money(openingStored)})</>}
                {' '}และ<b>บันทึกส่วนต่าง ฿{money(Math.abs(carryDiff))} ไว้ในกะนี้</b> เพื่อให้ย้อนดูได้ว่าคืนก่อนนับผิดหรือเงินหายระหว่างคืน
              </p>
              <input
                value={carryReason}
                onChange={(e) => setCarryReason(e.target.value)}
                placeholder="เช่น เมื่อคืนนับเหรียญสิบขาด / เจ้าของมาหยิบเพิ่มตอนดึก"
                className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          )}

          {loadingOrphan && <p className="text-xs text-gray-400">กำลังดูบิลที่ยังไม่เข้ากะ...</p>}

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
                  {orphan.bills === 0 && orphan.cash === 0 ? (
                    <>
                      <b>รวมเงินเข้า-ออกเก๊ะที่ลงไว้ตอนไม่มีกะ</b> — {orphan.movementIds.length} รายการ
                      ({fmtWhen(orphan.firstAt)}
                      {orphan.lastAt !== orphan.firstAt && <>-{fmtTime(orphan.lastAt)}</>})
                    </>
                  ) : orphan.afterClose ? (
                    <>
                      <b>ยกบิลที่ขายหลังปิดกะมารวมกะนี้</b> — หลังปิดกะ {fmtWhen(orphan.since)} มีขายอีก{' '}
                      {orphan.bills} ใบ ({fmtWhen(orphan.firstAt)}
                      {orphan.lastAt !== orphan.firstAt && <>-{fmtTime(orphan.lastAt)}</>})
                    </>
                  ) : (
                    <>
                      <b>รวมบิลที่ขายไปก่อนเปิดกะ</b> — วันนี้มีบิลหน้าร้าน {orphan.bills} ใบ ที่ขายตอนไม่มีกะเปิด
                    </>
                  )}
                  {orphan.cash > 0 && <> เงินสด ฿{money(orphan.cash)}</>}
                  {orphan.refunds > 0 && <> − คืนเงินสด ฿{money(orphan.refunds)}</>}
                  {orphan.returnRefunds > 0 && <> − คืนเงินสดจากใบคืน ฿{money(orphan.returnRefunds)}</>}
                  {orphan.movementsIn > 0 && <> + เติมเข้าเก๊ะ ฿{money(orphan.movementsIn)}</>}
                  {orphan.movementsOut > 0 && <> − หยิบออกจากเก๊ะ ฿{money(orphan.movementsOut)}</>}
                </span>
              </label>
              <p className="text-xs text-amber-800">
                {pullIn ? (
                  <>
                    ยอดขายก้อนนี้จะมาอยู่ในกะนี้ (กะเริ่มนับตั้งแต่ <b>{fmtWhen(orphan.firstAt)}</b>)
                    {orphan.movementIds.length > 0 && <> · เงินเข้า-ออกเก๊ะ {orphan.movementIds.length} รายการผูกเข้ากะนี้ด้วย</>} ·
                    เงินสดสุทธิ ฿{money(pending)} อยู่ในเก๊ะที่นับอยู่นี่แล้ว <b>ระบบหักออกจากยอดตั้งต้นให้เอง</b>{' '}
                    (ตั้งต้น ฿{money(openingStored)}) ตอนปิดกะเย็นนี้ยอดจะตรงกับเงินในเก๊ะ
                  </>
                ) : (
                  <>
                    ไม่ติ๊ก = ยอดขายก้อนนี้ไม่อยู่ในกะไหนเลย (ยังอยู่ในสรุปยอดขายรายวันตามปกติ) ·
                    เงินสดสุทธิ ฿{money(pending)} จะถูกนับเป็นเงินตั้งต้นของกะนี้แทน
                  </>
                )}
              </p>
              {orphan.hours > 36 && (
                <p className="text-xs font-medium text-red-700">
                  บิลแรกเก่ากว่า {Math.floor(orphan.hours / 24)} วันแล้ว — เช็กก่อนว่าเงินก้อนนี้ยังอยู่ในเก๊ะจริง
                  (ถ้าเจ้าของรับไปแล้วอย่าติ๊ก)
                </p>
              )}
            </div>
          )}

          {!loadingOrphan && !orphan && (
            <p className="flex items-start gap-1.5 text-xs text-gray-500">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-gray-400" />
              ไม่มีบิลเงินสดที่ค้างอยู่นอกกะ — เปิดกะได้เลย
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
