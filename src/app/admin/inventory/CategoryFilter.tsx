'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { CAT_CLINIC, CAT_NONE, CAT_SHOP, type CategoryOption } from './stockFilter'

/**
 * กรองสต็อคตามหมวด — เขียนลง ?cat= ใน URL แล้วให้ฝั่ง server กรองให้ เหมือน SearchBox
 * (ล็อตโตได้ไม่จำกัด โหลดมากรองในเบราว์เซอร์ไม่ได้)
 *
 * นอกจากหมวดตรงๆ ยังมีสองกลุ่มกว้างๆ ไว้กดเร็ว: ของคลินิก (ยา/เวชภัณฑ์) กับของหน้าร้าน
 * (อาหารสัตว์/pet shop) — ดูจากธง clinic_only
 */


export default function CategoryFilter({
  categories,
  value,
}: {
  categories: CategoryOption[]
  value: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function set(next: string) {
    const p = new URLSearchParams(params)
    if (next) p.set('cat', next)
    else p.delete('cat')
    startTransition(() => router.replace(`${pathname}?${p}`, { scroll: false }))
  }

  const clinic = categories.filter((c) => c.clinic_only)
  const shop = categories.filter((c) => !c.clinic_only)

  return (
    <select
      value={value}
      onChange={(e) => set(e.target.value)}
      aria-label="กรองตามหมวด"
      className={`border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        isPending ? 'opacity-60' : ''
      }`}
    >
      <option value="">ทุกหมวด</option>
      <option value={CAT_CLINIC}>— ของคลินิก (ยา/เวชภัณฑ์) —</option>
      <option value={CAT_SHOP}>— ของหน้าร้าน (อาหาร/pet shop) —</option>
      {shop.length > 0 && (
        <optgroup label="หน้าร้าน">
          {shop.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </optgroup>
      )}
      {clinic.length > 0 && (
        <optgroup label="คลินิก">
          {clinic.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </optgroup>
      )}
      <option value={CAT_NONE}>ไม่ระบุหมวด</option>
    </select>
  )
}
