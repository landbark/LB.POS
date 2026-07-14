'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Wallet, Lock, Unlock } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Shift } from '@/lib/types'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

const PAYMENT_LABELS: Record<string, string> = { cash: 'เงินสด', transfer: 'โอนเงิน', card: 'บัตรเครดิต', qr: 'QR Code' }

// ชนิดธนบัตร/เหรียญสำหรับนับเงินปิดกะ
const BANKNOTES = [
  { value: 1000, label: 'แบงค์พัน' },
  { value: 500, label: 'แบงค์ห้าร้อย' },
  { value: 100, label: 'แบงค์ร้อย' },
  { value: 50, label: 'แบงค์ห้าสิบ' },
  { value: 20, label: 'แบงค์ยี่สิบ' },
]
const COINS = [
  { value: 10, label: 'เหรียญสิบ' },
  { value: 5, label: 'เหรียญห้า' },
  { value: 2, label: 'เหรียญสอง' },
  { value: 1, label: 'เหรียญบาท' },
]
const DENOMS = [...BANKNOTES, ...COINS]

// คอลัมน์ใหม่จาก supabase-migration-shift-denominations.sql (ยังไม่อยู่ใน type Shift กลาง)
type ShiftRow = Shift & {
  closing_denominations?: Record<string, number> | null
  cash_to_owner?: number | null
}

export default function ShiftClient({
  openShift,
  history,
  currentUserId,
}: {
  openShift: ShiftRow | null
  history: ShiftRow[]
  currentUserId: string
}) {
  const router = useRouter()
  const [openingCash, setOpeningCash] = useState('')
  const [counts, setCounts] = useState<Record<number, string>>({})
  const [reopenNext, setReopenNext] = useState(true)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [breakdown, setBreakdown] = useState<Record<string, number>>({})
  const [cashRefunds, setCashRefunds] = useState(0)

  useEffect(() => {
    if (!openShift) return
    let cancelled = false

    async function loadSummary(shift: Shift) {
      const supabase = createClient()
      const [{ data: completed }, { data: refunds }] = await Promise.all([
        supabase.from('transactions').select('total, payment_method').eq('status', 'completed').gte('created_at', shift.opened_at),
        supabase.from('transactions').select('total').eq('status', 'cancelled').eq('refund_method', 'cash').gte('cancelled_at', shift.opened_at),
      ])
      if (cancelled) return
      const acc: Record<string, number> = {}
      for (const t of completed ?? []) acc[t.payment_method] = (acc[t.payment_method] ?? 0) + t.total
      setBreakdown(acc)
      setCashRefunds((refunds ?? []).reduce((s, t) => s + t.total, 0))
      setLoadingSummary(false)
    }

    loadSummary(openShift)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openShift?.id])

  const cashSales = breakdown.cash ?? 0
  const expectedCash = openShift ? openShift.opening_cash + cashSales - cashRefunds : 0
  const hasCount = DENOMS.some((d) => (counts[d.value] ?? '') !== '')
  const counted = DENOMS.reduce((s, d) => s + d.value * (parseInt(counts[d.value] || '0', 10) || 0), 0)
  const cashToOwner = 1000 * (parseInt(counts[1000] || '0', 10) || 0)
  const leftover = counted - cashToOwner
  const difference = counted - expectedCash

  async function openNewShift() {
    const cash = parseFloat(openingCash || '0')
    if (Number.isNaN(cash) || cash < 0) {
      toast.error('กรุณาใส่เงินสดตั้งต้น')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('shifts').insert({
      opening_cash: cash,
      opened_by: currentUserId,
    })
    setLoading(false)
    if (error) {
      toast.error(error.code === '23505' ? 'มีกะที่เปิดอยู่แล้ว' : 'เกิดข้อผิดพลาด: ' + error.message)
      return
    }
    toast.success('เปิดกะแล้ว')
    router.refresh()
  }

  async function closeShift() {
    if (!openShift) return
    if (!hasCount) {
      toast.error('กรุณานับเงินอย่างน้อย 1 ช่อง (ถ้าไม่มีให้ใส่ 0)')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const denominations = Object.fromEntries(
      DENOMS.filter((d) => (counts[d.value] ?? '') !== '')
        .map((d) => [String(d.value), parseInt(counts[d.value], 10) || 0])
    )
    const { error } = await supabase
      .from('shifts')
      .update({
        closed_at: new Date().toISOString(),
        closed_by: currentUserId,
        expected_cash: expectedCash,
        closing_cash_counted: counted,
        cash_difference: difference,
        closing_denominations: denominations,
        cash_to_owner: cashToOwner,
        notes: notes.trim() || null,
      })
      .eq('id', openShift.id)
    if (error) {
      setLoading(false)
      toast.error('เกิดข้อผิดพลาด: ' + error.message)
      return
    }

    // เปิดกะถัดไปต่อเลยด้วยเงินคงเหลือหลังแยกแบงค์พัน (ร้านปิดกลางคืน ไม่มีกะดึก)
    if (reopenNext) {
      const { error: openError } = await supabase.from('shifts').insert({
        opening_cash: leftover,
        opened_by: currentUserId,
      })
      if (openError) {
        setLoading(false)
        toast.error('ปิดกะแล้ว แต่เปิดกะใหม่ไม่สำเร็จ: ' + openError.message)
        setCounts({})
        setNotes('')
        router.refresh()
        return
      }
      toast.success(`ปิดกะแล้ว และเปิดกะใหม่ด้วยเงินคงเหลือ ฿${money(leftover)}`)
    } else {
      toast.success('ปิดกะแล้ว')
    }
    setLoading(false)
    setCounts({})
    setNotes('')
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ปิดกะ / นับเงินสด</h1>
      <p className="text-sm text-gray-500 mb-6">กะเดียวรวมของร้าน ใครขายช่วงไหนก็รวมเข้ากะที่เปิดอยู่ ไม่บังคับเปิดกะก่อนขาย</p>

      {!openShift ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-sm">
          <div className="flex items-center gap-2 mb-4">
            <Unlock size={18} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">เปิดกะใหม่</h2>
          </div>
          <label className="block text-xs font-medium text-gray-600 mb-1">เงินสดตั้งต้น</label>
          <input
            type="number" min={0} step="0.01"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            className={inputClass}
            placeholder="0.00"
          />
          <button
            onClick={openNewShift}
            disabled={loading}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Wallet size={15} /> {loading ? 'กำลังเปิดกะ...' : 'เปิดกะ'}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Unlock size={18} className="text-green-500" />
            <h2 className="font-semibold text-gray-900">กะกำลังเปิดอยู่</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            เปิดเมื่อ {fmtDate(openShift.opened_at)} โดย {openShift.opener?.name ?? '—'} · เงินสดตั้งต้น ฿{money(openShift.opening_cash)}
          </p>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 mb-4 text-sm">
            {loadingSummary ? (
              <p className="text-gray-400">กำลังคำนวณ...</p>
            ) : (
              <>
                {Object.entries(PAYMENT_LABELS).map(([key, label]) =>
                  breakdown[key] ? (
                    <div key={key} className="flex justify-between text-gray-600">
                      <span>ขาย{label}</span><span>฿{money(breakdown[key])}</span>
                    </div>
                  ) : null
                )}
                {cashRefunds > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>คืนเงินสด (ใบเสร็จยกเลิก)</span><span>-฿{money(cashRefunds)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
                  <span>เงินสดที่ควรมีในลิ้นชัก</span><span>฿{money(expectedCash)}</span>
                </div>
              </>
            )}
          </div>

          <label className="block text-xs font-medium text-gray-600 mb-2">นับเงินสดจริง (ใส่จำนวนใบ/เหรียญ)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-3">
            {[BANKNOTES, COINS].map((group, gi) => (
              <div key={gi} className="space-y-1.5">
                {group.map((d) => {
                  const qty = parseInt(counts[d.value] || '0', 10) || 0
                  return (
                    <div key={d.value} className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-[5.5rem] shrink-0">{d.label}</span>
                      <input
                        type="number" min={0} step={1} inputMode="numeric"
                        value={counts[d.value] ?? ''}
                        onChange={(e) => setCounts((c) => ({ ...c, [d.value]: e.target.value }))}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                      <span className={`text-sm text-right flex-1 tabular-nums ${qty > 0 ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                        ฿{money(d.value * qty)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between font-bold text-gray-900">
              <span>รวมนับได้</span><span>฿{money(counted)}</span>
            </div>
            {hasCount && (
              <p className={`text-xs font-medium ${difference === 0 ? 'text-green-600' : difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {difference === 0 ? 'ตรงกับที่ควรมีพอดี' : difference > 0 ? `เกิน ฿${money(difference)}` : `ขาด ฿${money(Math.abs(difference))}`}
              </p>
            )}
            <div className="flex justify-between text-gray-600 pt-1 border-t border-gray-200">
              <span>แยกแบงค์พันให้เจ้าของ</span><span>-฿{money(cashToOwner)}</span>
            </div>
            <div className="flex justify-between font-medium text-gray-900">
              <span>เหลือในลิ้นชัก (เงินตั้งต้นกะถัดไป)</span><span>฿{money(leftover)}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 mt-3 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={reopenNext}
              onChange={(e) => setReopenNext(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            เปิดกะใหม่ต่อเลยด้วยเงินคงเหลือ ฿{money(leftover)}
          </label>

          <label className="block text-xs font-medium text-gray-600 mb-1 mt-3">หมายเหตุ (ถ้ามี)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
            placeholder="เช่น เหตุผลที่เงินขาด/เกิน"
          />

          <button
            onClick={closeShift}
            disabled={loading}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Lock size={15} /> {loading ? 'กำลังปิดกะ...' : 'ปิดกะ'}
          </button>
        </div>
      )}

      <h2 className="font-semibold text-gray-900 mb-3">ประวัติกะที่ผ่านมา</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 whitespace-nowrap">เปิด - ปิด</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">โดย</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">เงินตั้งต้น</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">คาดว่ามี</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">นับได้จริง</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ให้เจ้าของ</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ผลต่าง</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {history.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                  {fmtDate(s.opened_at)} - {s.closed_at ? fmtDate(s.closed_at) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {s.opener?.name ?? '—'} / {s.closer?.name ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">฿{money(s.opening_cash)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{s.expected_cash != null ? `฿${money(s.expected_cash)}` : '—'}</td>
                <td
                  className="px-4 py-3 text-sm text-right text-gray-700"
                  title={s.closing_denominations
                    ? DENOMS.filter((d) => s.closing_denominations?.[String(d.value)])
                        .map((d) => `${d.label} × ${s.closing_denominations![String(d.value)]}`)
                        .join('\n')
                    : undefined}
                >
                  {s.closing_cash_counted != null ? `฿${money(s.closing_cash_counted)}` : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{s.cash_to_owner != null && s.cash_to_owner > 0 ? `฿${money(s.cash_to_owner)}` : '—'}</td>
                <td className={`px-4 py-3 text-sm text-right font-semibold ${
                  s.cash_difference == null ? 'text-gray-400' : s.cash_difference === 0 ? 'text-green-600' : s.cash_difference > 0 ? 'text-blue-600' : 'text-red-600'
                }`}>
                  {s.cash_difference != null ? `${s.cash_difference > 0 ? '+' : ''}฿${money(s.cash_difference)}` : '—'}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีประวัติกะ</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
