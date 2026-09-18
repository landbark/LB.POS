'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X, Loader2 } from 'lucide-react'

const DEBOUNCE_MS = 300

/**
 * ช่องค้นหาที่เขียนคำค้นลง ?q= ใน URL แล้วให้ฝั่ง server ค้นให้
 *
 * ต่างจากการ filter ในเบราว์เซอร์ตรงที่ไม่ต้องโหลดทั้งตารางมาก่อน —
 * หน้าไหนที่มีแถวโตได้ไม่จำกัด (ลูกค้า สัตว์ ล็อตสินค้า) ต้องใช้แบบนี้
 */
export default function SearchBox({
  placeholder,
  className = '',
}: {
  placeholder: string
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const current = params.get('q') ?? ''
  const [value, setValue] = useState(current)
  const [syncedWith, setSyncedWith] = useState(current)

  // URL เปลี่ยนเอง (กด back/forward) — ปรับค่าในช่องระหว่าง render ตามแนวทางของ React
  // ไม่ใช่ setState ใน effect ซึ่งทำให้ render ซ้อนรอบ
  if (syncedWith !== current) {
    setSyncedWith(current)
    setValue(current)
  }

  useEffect(() => {
    if (value === current) return

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (value.trim()) next.set('q', value.trim())
      else next.delete('q')
      startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }))
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [value, current, params, pathname, router])

  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {isPending ? (
        <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
      ) : value ? (
        <button
          onClick={() => setValue('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 p-0.5"
          title="ล้างคำค้น"
        >
          <X size={15} />
        </button>
      ) : null}
    </div>
  )
}
