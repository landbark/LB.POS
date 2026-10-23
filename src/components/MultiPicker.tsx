'use client'

import { useMemo, useState } from 'react'
import { Search, X, Check } from 'lucide-react'

export interface PickerOption {
  id: string
  name: string
  /** บรรทัดเล็กใต้ชื่อ เช่น SKU กับหมวดของสินค้า */
  hint?: string | null
  /** ข้อความอื่นที่ค้นเจอได้ด้วย (SKU / บาร์โค้ด รวมของหน่วยย่อย) — ไม่ต้องโชว์ */
  keywords?: string | null
}

/** จำนวนแถวที่วาดจริง — ที่เหลือให้พิมพ์ค้นหาเอา */
const RENDER_LIMIT = 60

interface Props {
  options: PickerOption[]
  selected: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  emptyLabel?: string
}

/**
 * เลือกหลายรายการจากลิสต์ยาวๆ — ช่องค้นหา + ติ๊กเลือก + ชิปสรุปด้านบน
 * (ร้านมีสินค้าเป็นพันรายการ ใช้ select multiple ธรรมดาหาไม่เจอ)
 */
export default function MultiPicker({
  options,
  selected,
  onChange,
  placeholder = 'พิมพ์ค้นหา...',
  emptyLabel = 'ยังไม่ได้เลือก',
}: Props) {
  const [query, setQuery] = useState('')

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    // ค้นได้ทั้งชื่อ SKU และบาร์โค้ด เหมือนช่องค้นหาที่หน้าขาย — ยิงบาร์โค้ดใส่ก็เจอ
    const list = q
      ? options.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            (o.keywords != null && o.keywords.toLowerCase().includes(q)),
        )
      : options
    // เลือกไว้แล้วให้ลอยขึ้นบน เห็นว่าติ๊กอะไรไปแล้วโดยไม่ต้องเลื่อนหา
    const picked = new Set(selected)
    return [...list].sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id)))
  }, [options, query, selected])

  // ร้านมีสินค้าเกินพันตัว — วาดครบทุกตัวทำให้ทุกตัวอักษรที่พิมพ์หน่วง วาดเท่าที่ดูไหวพอ
  // (ที่เลือกไว้แล้วต้องอยู่ในลิสต์เสมอ จะได้กดติ๊กออกได้)
  const limit = Math.max(RENDER_LIMIT, selected.length)
  const visible = matches.slice(0, limit)
  const hidden = matches.length - visible.length

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {selected.length === 0 ? (
          <span className="text-xs text-gray-400">{emptyLabel}</span>
        ) : (
          <>
            {selected.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded-full"
              >
                {byId.get(id)?.name ?? '(ถูกลบแล้ว)'}
                <button type="button" onClick={() => toggle(id)} className="hover:text-blue-900" title="เอาออก">
                  <X size={12} />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-gray-400 hover:text-red-600 underline"
            >
              ล้างทั้งหมด
            </button>
          </>
        )}
      </div>

      <div className="relative mb-1.5">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-50 bg-white">
        {visible.map((o) => {
          const picked = selected.includes(o.id)
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                picked ? 'bg-blue-50/60' : ''
              }`}
            >
              <span
                className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                  picked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
                }`}
              >
                {picked && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-gray-800">{o.name}</span>
                {o.hint && <span className="block truncate text-xs text-gray-400">{o.hint}</span>}
              </span>
            </button>
          )
        })}
        {matches.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-gray-400">ไม่พบรายการที่ค้นหา</div>
        )}
        {hidden > 0 && (
          <div className="px-3 py-2 text-center text-xs text-gray-400">
            ยังมีอีก {hidden} รายการ — พิมพ์ค้นหาเพื่อกรองให้แคบลง
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">เลือกแล้ว {selected.length} รายการ</p>
    </div>
  )
}
