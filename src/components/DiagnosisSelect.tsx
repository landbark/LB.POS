'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Diagnosis } from '@/lib/types'
import { findByName, hasThai, searchDiagnoses } from '@/lib/diagnoses'

interface Props {
  /** โรคที่เลือกไว้ของ visit นี้ */
  value: Diagnosis[]
  onChange: (next: Diagnosis[]) => void
  /** แคตตาล็อกทั้งหมดจาก DB */
  catalog: Diagnosis[]
  disabled?: boolean
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// เลือกชื่อโรคจากแคตตาล็อก (ติดได้หลายโรคต่อหนึ่งครั้งตรวจ) + เพิ่มโรคใหม่ตรงนี้เลยถ้ายังไม่มีในรายการ
// ชื่อโรคจัดการรวม/แก้ชื่อได้ที่ /admin/diagnoses — ตรงนี้เพิ่มได้อย่างเดียว กันเผลอลบของคนอื่นในห้องตรวจ
export default function DiagnosisSelect({ value, onChange, catalog, disabled = false }: Props) {
  const [list, setList] = useState(catalog)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedIds = new Set(value.map((d) => d.id))
  const matches = searchDiagnoses(list, query).filter((d) => !selectedIds.has(d.id))
  const typed = query.trim()
  // พิมพ์ตรงกับชื่อที่มีอยู่แล้วเป๊ะๆ ไม่ต้องเสนอให้เพิ่มใหม่ (unique index เป็น lower(name) อยู่แล้ว)
  const exact = typed ? findByName(list, typed) : null

  function add(d: Diagnosis) {
    if (!selectedIds.has(d.id)) onChange([...value, d])
    setQuery('')
  }

  async function addNew() {
    const name = typed
    if (!name) return
    if (exact) { add(exact); return }

    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('diagnoses')
      .insert({
        name,
        name_en: hasThai(name) ? null : name,
        name_th: hasThai(name) ? name : null,
      })
      .select()
      .single()
    setSaving(false)

    if (error) {
      // 23505 = คนอื่นเพิ่งเพิ่มชื่อนี้ไปจากอีกเครื่อง — ดึงตัวที่มีอยู่มาใช้แทนที่จะให้หมอพิมพ์ใหม่
      if (error.code === '23505') {
        const { data: existing } = await supabase.from('diagnoses').select('*').ilike('name', name).maybeSingle()
        if (existing) {
          setList((prev) => (prev.some((d) => d.id === existing.id) ? prev : [...prev, existing]))
          add(existing)
          return
        }
      }
      toast.error('เพิ่มชื่อโรคไม่สำเร็จ')
      return
    }

    setList((prev) => [...prev, data])
    add(data)
    toast.success(`เพิ่มชื่อโรค "${name}" แล้ว`)
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full">
              {d.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x.id !== d.id))}
                  title="เอาโรคนี้ออก"
                  className="p-0.5 text-blue-400 hover:text-blue-700"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!disabled && (
        <div className="relative">
          <div className="flex items-center gap-2">
            <Plus size={15} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (matches.length > 0) add(matches[0])
                else if (typed) addNew()
              }}
              placeholder={saving ? 'กำลังเพิ่มชื่อโรค...' : 'พิมพ์ชื่อโรค เพื่อเลือกจากรายการ...'}
              disabled={saving}
              className={inputClass}
            />
          </div>

          {(matches.length > 0 || (typed && !exact)) && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
              {matches.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => add(d)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {d.name}
                </button>
              ))}
              {typed && !exact && (
                <button
                  type="button"
                  onClick={addNew}
                  disabled={saving}
                  className="w-full text-left px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 border-t border-gray-100 disabled:opacity-40"
                >
                  + เพิ่ม &quot;{typed}&quot; เป็นชื่อโรคใหม่
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {disabled && value.length === 0 && <p className="text-sm text-gray-400">—</p>}
    </div>
  )
}
