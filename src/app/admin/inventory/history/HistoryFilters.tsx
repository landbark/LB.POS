'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const TYPES = [
  { value: 'adjust', label: 'เฉพาะการปรับสต็อก' },
  { value: 'all', label: 'ทุกการเคลื่อนไหว' },
  { value: 'sale', label: 'ขาย' },
  { value: 'receive', label: 'รับเข้า' },
  { value: 'cancel', label: 'คืนจากยกเลิก' },
]

/** ตัวกรองวัน/ประเภท — เขียนลง URL แล้วให้ฝั่ง server ค้นให้ เหมือน SearchBox */
export default function HistoryFilters({ from, to, type }: { from: string; to: string; type: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function set(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // เปลี่ยนตัวกรองแล้วต้องกลับหน้าแรกเสมอ ไม่งั้นค้างอยู่หน้า 7 ของผลลัพธ์ชุดใหม่
    next.delete('page')
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }))
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
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">ประเภท</label>
        <select value={type} onChange={(e) => set('type', e.target.value)} className={inputClass}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
