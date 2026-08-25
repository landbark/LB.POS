'use client'

import { useEffect, useState } from 'react'
import { MapPinned } from 'lucide-react'

export interface PostcodeMatch {
  subdistrict: string
  district: string
  province: string
}

// กรอกรหัสไปรษณีย์แล้วเลือกตำบล/อำเภอได้เลย ไม่ต้องพิมพ์เอง
// รหัสไหนมีที่เดียวจะเติมให้อัตโนมัติ
export default function PostcodeLookup({
  postcode,
  onPick,
}: {
  postcode: string
  onPick: (match: PostcodeMatch) => void
}) {
  const [options, setOptions] = useState<PostcodeMatch[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function lookup() {
      const code = postcode.trim()
      if (!/^\d{5}$/.test(code)) {
        setOptions([])
        return
      }
      setLoading(true)
      try {
        const res = await fetch(`/api/shop/postcode?code=${code}`)
        const data = await res.json()
        if (cancelled) return
        const found: PostcodeMatch[] = data.options ?? []
        setOptions(found)
        // มีที่เดียว = เติมให้เลย ไม่ต้องให้เลือก
        if (found.length === 1) onPick(found[0])
      } catch {
        if (!cancelled) setOptions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    lookup()

    return () => { cancelled = true }
    // onPick เปลี่ยน identity ทุก render ของ parent — ไม่ใส่ใน deps กันยิงซ้ำไม่จบ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode])

  if (loading) {
    return <p className="text-xs text-gray-400">กำลังค้นหาที่อยู่จากรหัสไปรษณีย์...</p>
  }
  if (options.length === 0) return null
  if (options.length === 1) {
    return (
      <p className="text-xs text-green-700 flex items-center gap-1">
        <MapPinned size={13} /> {options[0].subdistrict} · {options[0].district} · {options[0].province}
      </p>
    )
  }

  return (
    <div>
      <select
        defaultValue=""
        onChange={(e) => {
          const picked = options[Number(e.target.value)]
          if (picked) onPick(picked)
        }}
        className="w-full rounded-lg border border-brand-muted/40 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-brown/40"
      >
        <option value="">เลือกตำบล / อำเภอ ({options.length} รายการในรหัสนี้)</option>
        {options.map((o, i) => (
          <option key={`${o.subdistrict}-${o.district}`} value={i}>
            {o.subdistrict} · {o.district} · {o.province}
          </option>
        ))}
      </select>
    </div>
  )
}
