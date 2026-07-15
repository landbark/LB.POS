'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Wallet, Trophy, AlertTriangle } from 'lucide-react'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

const PAYMENT_TH: Record<string, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  card: 'บัตรเครดิต',
  qr: 'QR Code',
}

export interface ShiftSummary {
  id: string
  opened_at: string
  opening_cash: number
  closed_at: string | null
  expected_cash: number | null
  closing_cash_counted: number | null
  cash_difference: number | null
  notes: string | null
  opener: { name: string } | null
  closer: { name: string } | null
}

interface Props {
  date: string
  today: string
  netTotal: number
  txCount: number
  discountTotal: number
  cancelledCount: number
  cancelledTotal: number
  byMethod: { method: string; amount: number; count: number }[]
  bestSellers: { name: string; unit: string; qty: number; revenue: number }[]
  shifts: ShiftSummary[]
}

const TOP_N = 5

// เลื่อนวันแบบ string ตรงๆ (YYYY-MM-DD) ไม่ผ่าน timezone ของเครื่อง
function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const thaiDateLabel = (date: string) =>
  new Date(`${date}T00:00:00+07:00`).toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok',
  })

export default function DailySummaryClient({
  date, today, netTotal, txCount, discountTotal, cancelledCount, cancelledTotal, byMethod, bestSellers, shifts,
}: Props) {
  const router = useRouter()
  const [showAll, setShowAll] = useState(false)

  const isToday = date === today
  const go = (d: string) => router.push(`/admin/daily?date=${d}`)
  const visibleSellers = showAll ? bestSellers : bestSellers.slice(0, TOP_N)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">สรุปรายวัน</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => go(shiftDate(date, -1))} className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50" title="วันก่อนหน้า">
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => go(shiftDate(date, 1))}
            disabled={isToday}
            className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            title="วันถัดไป"
          >
            <ChevronRight size={16} />
          </button>
          {!isToday && (
            <button onClick={() => go(today)} className="text-sm font-medium text-blue-600 hover:text-blue-700 px-2 py-1.5">
              วันนี้
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">{thaiDateLabel(date)}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">ยอดขายสุทธิ</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">฿{money(netTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {txCount} บิล
            {discountTotal > 0 && ` · ส่วนลดรวม ฿${money(discountTotal)}`}
          </p>
          {cancelledCount > 0 && (
            <p className="text-xs text-red-500 mt-0.5">ยกเลิก {cancelledCount} ใบ (฿{money(cancelledTotal)}) — ไม่รวมในยอดข้างบน</p>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-2">แยกตามวิธีชำระ</p>
          <div className="space-y-1.5">
            {byMethod.map(({ method, amount, count }) => (
              <div key={method} className="flex justify-between text-sm">
                <span className="text-gray-600">{PAYMENT_TH[method] ?? method} <span className="text-gray-400">({count} บิล)</span></span>
                <span className="font-semibold text-gray-900 tabular-nums">฿{money(amount)}</span>
              </div>
            ))}
            {byMethod.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีรายการขาย</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Trophy size={16} className="text-amber-500" />
            <h2 className="font-semibold text-gray-900">สินค้าขายดี</h2>
            {bestSellers.length > 0 && <span className="text-xs text-gray-400">({bestSellers.length} รายการ)</span>}
          </div>
          <div className={showAll ? 'max-h-96 overflow-y-auto' : ''}>
            <div className="divide-y divide-gray-50">
              {visibleSellers.map((p, i) => (
                <div key={`${p.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? 'bg-amber-100 text-amber-700' : i < 3 ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {i + 1}
                  </span>
                  <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-sm text-gray-500 shrink-0">{p.qty.toLocaleString('th-TH')} {p.unit}</p>
                  <p className="text-sm font-semibold text-gray-900 shrink-0 w-24 text-right tabular-nums">฿{money(p.revenue)}</p>
                </div>
              ))}
              {bestSellers.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีสินค้าขายวันนี้</p>
              )}
            </div>
          </div>
          {bestSellers.length > TOP_N && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 border-t border-gray-100"
            >
              {showAll ? 'ย่อเหลือ 5 อันดับ' : `ดูทั้งหมด (${bestSellers.length} รายการ)`}
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Wallet size={16} className="text-gray-500" />
            <h2 className="font-semibold text-gray-900">เงินสดในลิ้นชัก (กะ)</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {shifts.map((s) => {
              const short = s.cash_difference != null && s.cash_difference < 0
              return (
                <div key={s.id} className="px-4 py-3">
                  <p className="text-xs text-gray-400 mb-2">
                    {fmtTime(s.opened_at)} เปิดโดย {s.opener?.name ?? '—'}
                    {s.closed_at
                      ? ` · ${fmtTime(s.closed_at)} ปิดโดย ${s.closer?.name ?? '—'}`
                      : ' · กำลังเปิดอยู่'}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">เงินตั้งต้น</p>
                      <p className="font-semibold text-gray-900 tabular-nums">฿{money(s.opening_cash)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">ควรมีตอนปิด</p>
                      <p className="font-semibold text-gray-900 tabular-nums">{s.expected_cash != null ? `฿${money(s.expected_cash)}` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">นับได้จริง</p>
                      <p className="font-semibold text-gray-900 tabular-nums">{s.closing_cash_counted != null ? `฿${money(s.closing_cash_counted)}` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">ผลต่าง</p>
                      <p className={`font-semibold tabular-nums ${
                        s.cash_difference == null ? 'text-gray-400' : s.cash_difference === 0 ? 'text-green-600' : s.cash_difference > 0 ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {s.cash_difference == null ? '—' : s.cash_difference === 0 ? 'ครบพอดี' : s.cash_difference > 0 ? `เกิน ฿${money(s.cash_difference)}` : `ขาด ฿${money(Math.abs(s.cash_difference))}`}
                      </p>
                    </div>
                  </div>
                  {short && (
                    <div className="mt-2 flex items-start gap-1.5 bg-red-50 rounded-lg px-3 py-2">
                      <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-600">
                        เงินขาด ฿{money(Math.abs(s.cash_difference!))}
                        {s.notes ? ` — หมายเหตุ: ${s.notes}` : ' — ไม่ได้ระบุหมายเหตุตอนปิดกะ'}
                      </p>
                    </div>
                  )}
                  {!short && s.notes && (
                    <p className="mt-2 text-xs text-gray-500">หมายเหตุ: {s.notes}</p>
                  )}
                </div>
              )
            })}
            {shifts.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-gray-400">ไม่มีกะในวันนี้</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
