'use client'

import { useEffect, useState } from 'react'
import { X, Wallet, AlertTriangle, ArrowRightLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { BANKNOTES, COINS, DENOMS } from '@/lib/shiftFloat'
import { denomDiffs, findCarryOver, findOrphanSales, openShift, type CarryOver, type OrphanSales } from '@/lib/shiftOpen'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })

/**
 * เปิดกะได้จากทุกหน้า — หน้าขายเรียกจากแถบเตือน "ยังไม่ได้เปิดกะ" (ไม่ต้องทิ้งตะกร้าไปหน้าอื่น)
 * ถ้าวันนี้ขายไปแล้วตอนไม่มีกะเปิด จะเสนอรวมบิลพวกนั้นเข้ากะนี้ให้ด้วย
 *
 * ช่องนับเงินเติมใบนับที่กะที่แล้วเหลือไว้มาให้ก่อน คนเปิดกะแก้เฉพาะกองที่ไม่ตรง — ได้ทั้ง
 * ยอดตั้งต้นที่ถูกและคำตอบว่า "กองไหนไม่ตรง" ซึ่งบอกได้ว่าคืนก่อนนับผิดหรือเงินหายจริง
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
  const [floatDenoms, setFloatDenoms] = useState<Record<number, number> | null>(null)
  // ชนิดที่เก็บไว้ทั้งหมด (เช่น แบงค์ห้าสิบ) — ไม่เตือนว่าขาด และไม่นับเป็นส่วนเกินของเป้า
  const [floatKeep, setFloatKeep] = useState<number[]>([])
  // นับแยกใบ/เหรียญ (ค่าเริ่มต้นถ้ากะที่แล้วนับแยกไว้) หรือใส่ยอดรวมก้อนเดียวแบบเดิม
  const [byDenom, setByDenom] = useState(false)
  const [counts, setCounts] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      findOrphanSales(),
      findCarryOver(),
      createClient().from('store_settings').select('float_target, float_denoms, float_keep').limit(1).maybeSingle(),
    ]).then(([found, over, store]) => {
      if (cancelled) return
      setOrphan(found)
      setCarry(over)
      setFloatTarget(store.data?.float_target != null ? Number(store.data.float_target) : null)
      const fd = store.data?.float_denoms as Record<string, number> | null | undefined
      setFloatDenoms(fd ? Object.fromEntries(Object.entries(fd).map(([v, q]) => [Number(v), Number(q) || 0])) : null)
      setFloatKeep((store.data?.float_keep as number[] | null) ?? [])
      if (over) setCash(String(over.amount))
      // กะที่แล้วนับแยกไว้ → เติมใบนับนั้นมาให้ แก้เฉพาะกองที่ไม่ตรงก็พอ
      if (over?.denoms) {
        setByDenom(true)
        setCounts(Object.fromEntries(DENOMS.map((d) => [d.value, over.denoms![d.value] ? String(over.denoms![d.value]) : ''])))
      }
      setLoadingOrphan(false)
    })
    return () => { cancelled = true }
  }, [])

  const qtyOf = (v: number) => parseInt(counts[v] || '0', 10) || 0
  const countedDenoms: Record<number, number> = Object.fromEntries(DENOMS.map((d) => [d.value, qtyOf(d.value)]))
  const denomTotal = DENOMS.reduce((s, d) => s + d.value * qtyOf(d.value), 0)
  const typed = byDenom ? denomTotal : parseFloat(cash || '0')
  // ต่างจากยอดยกมาเท่าไหร่ — ค่านี้จะถูกเขียนลง shifts.notes ตอนเปิดกะ
  const carryDiff = carry && !Number.isNaN(typed) ? typed - carry.amount : 0
  const diffs = byDenom && carry ? denomDiffs(carry, countedDenoms) : []
  // กองที่เงินทอนไม่พอตั้งแต่ก่อนเปิดร้าน — ตัวที่เคยทำให้ต้องวิ่งหาเงินทอนตอนบ่าย
  const shortages = byDenom && floatDenoms
    ? DENOMS.filter((d) => !floatKeep.includes(d.value) && (floatDenoms[d.value] ?? 0) > qtyOf(d.value))
        .map((d) => ({ ...d, need: (floatDenoms[d.value] ?? 0) - qtyOf(d.value) }))
    : []

  // ชนิดที่เก็บไว้ทั้งหมดลอยไปตามที่รับมาจากลูกค้า — บวกตามที่กะที่แล้วเหลือไว้ ไม่งั้นขึ้นว่าไม่ตรงทุกวัน
  const keptLabels = DENOMS.filter((d) => floatKeep.includes(d.value)).map((d) => d.label).join('/')
  const floatExpected =
    floatTarget == null || (floatKeep.length > 0 && !carry?.denoms)
      ? null
      : floatTarget + floatKeep.reduce((s, d) => s + d * (carry?.denoms?.[d] ?? 0), 0)

  async function submit() {
    const amount = byDenom ? denomTotal : parseFloat(cash || '0')
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
      openingDenoms: byDenom ? countedDenoms : null,
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
                  if (byDenom) setCash(String(denomTotal))
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
                        const want = floatKeep.includes(d.value) ? 0 : floatDenoms?.[d.value] ?? 0
                        return (
                          <div key={d.value} className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 w-[5.5rem] shrink-0">{d.label}</span>
                            <input
                              type="number" min={0} step={1} inputMode="numeric"
                              value={counts[d.value] ?? ''}
                              onChange={(e) => setCounts((c) => ({ ...c, [d.value]: e.target.value }))}
                              className={`w-16 border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 ${
                                want > qty ? 'border-red-300 focus:ring-red-400' : 'border-gray-300 focus:ring-[#C4865A]'
                              }`}
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

          {shortages.length > 0 && (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">เงินทอนไม่พอตั้งแต่เปิดร้าน</p>
              <div className="mt-1 space-y-0.5">
                {shortages.map((sh) => (
                  <p key={sh.value} className="text-xs text-red-700">
                    {sh.label} มี {qtyOf(sh.value)} ต้องการ {floatDenoms![sh.value]} — ขาดอีก <b>{sh.need}</b>
                  </p>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-red-600">
                แลกมาเติมก่อนเริ่มขาย ไม่งั้นต้องมาวิ่งหาเงินทอนกลางวัน · เติมแล้วแก้ตัวเลขข้างบนให้ตรงด้วย
              </p>
            </div>
          )}

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
              {carry.adjustedAt && (
                <p className="text-xs text-[#7A4E2D]">
                  เจ้าของจัดเงินทอนหลังปิดกะแล้วเมื่อ {fmtTime(carry.adjustedAt)} — ยอดยกมาข้างบนคิดจากใบนับหลังจัด
                </p>
              )}
              {floatExpected != null && (
                <p className={`text-xs ${carry.amount === floatExpected ? 'text-gray-500' : 'text-amber-700 font-medium'}`}>
                  เงินทอนตั้งต้นคงที่ ฿{money(floatExpected)}
                  {keptLabels && <> (รวม{keptLabels}ที่มีอยู่)</>}
                  {carry.amount !== floatExpected && <> — กะที่แล้วเหลือไว้ไม่ตรงยอดนี้ ฿{money(Math.abs(carry.amount - floatExpected))}</>}
                </p>
              )}
              {carryDiff === 0 ? (
                <p className="text-xs text-gray-500">
                  {byDenom
                    ? 'เติมใบนับของกะที่แล้วให้แล้ว — นับในเก๊ะแล้วแก้เฉพาะกองที่ไม่ตรง'
                    : 'เติมยอดนี้ให้แล้ว — นับเงินในเก๊ะดูก่อน ถ้าไม่เท่ากันให้แก้ตามที่นับได้จริง'}
                </p>
              ) : (
                <p className="text-xs font-medium text-amber-800">
                  นับได้{carryDiff > 0 ? 'เกิน' : 'ขาด'}ไป ฿{money(Math.abs(carryDiff))} จากยอดยกมา
                </p>
              )}
              {diffs.length > 0 && (
                <div className="pt-1.5 border-t border-gray-200 space-y-0.5">
                  <p className="text-xs font-medium text-gray-600">กองที่ไม่ตรงกับใบนับเมื่อคืน</p>
                  {diffs.map((x) => (
                    <p key={x.value} className="text-xs text-gray-600 tabular-nums">
                      {x.label} <span className="text-gray-400">เมื่อคืน {x.was} → เช้านี้ {x.now}</span>{' '}
                      <b className={x.now > x.was ? 'text-blue-600' : 'text-red-600'}>
                        {x.now > x.was ? '+' : '−'}฿{money(Math.abs((x.now - x.was) * x.value))}
                      </b>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {carryDiff !== 0 && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-900">
                เปิดกะได้เลย ระบบจะใช้ยอดที่นับได้จริงเป็นตั้งต้น และ<b>บันทึกส่วนต่าง ฿{money(Math.abs(carryDiff))} ไว้ในกะนี้</b>
                {diffs.length > 0 && <> พร้อมกองที่ไม่ตรง</>} เพื่อให้ย้อนดูได้ว่าคืนก่อนนับผิดหรือเงินหายระหว่างคืน
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
