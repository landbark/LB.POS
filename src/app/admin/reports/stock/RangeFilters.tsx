'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { thaiDateIn, thaiMonthStart, thaiToday } from '@/lib/thaiDate'

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

/** ช่วงที่ร้านดูบ่อย — กดปุ่มเดียวแทนการเลือกวันสองช่อง */
const PRESETS = [
  { label: 'วันนี้', from: () => thaiToday(), to: () => thaiToday() },
  { label: '7 วัน', from: () => thaiDateIn(-6), to: () => thaiToday() },
  { label: '30 วัน', from: () => thaiDateIn(-29), to: () => thaiToday() },
  { label: 'เดือนนี้', from: () => thaiMonthStart(), to: () => thaiToday() },
]

/** ตัวกรองช่วงวัน — เขียนลง URL แล้วให้ฝั่ง server คิดยอดให้ เหมือนหน้าประวัติสต็อค */
export default function RangeFilters({ from, to }: { from: string; to: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function apply(next: URLSearchParams) {
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }))
  }

  function set(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    apply(next)
  }

  function setRange(nextFrom: string, nextTo: string) {
    const next = new URLSearchParams(params)
    next.set('from', nextFrom)
    next.set('to', nextTo)
    apply(next)
  }

  return (
    <div className={`flex flex-wrap items-end gap-3 ${isPending ? 'opacity-60' : ''}`}>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">ตั้งแต่</label>
        <input type="date" value={from} max={to} onChange={(e) => set('from', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">ถึง</label>
        <input type="date" value={to} min={from} onChange={(e) => set('to', e.target.value)} className={inputClass} />
      </div>
      <div className="flex gap-2">
        {PRESETS.map((p) => {
          const pFrom = p.from()
          const pTo = p.to()
          const active = from === pFrom && to === pTo
          return (
            <button
              key={p.label}
              onClick={() => setRange(pFrom, pTo)}
              className={`px-3 py-2 rounded-lg text-sm border ${
                active ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
