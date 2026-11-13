'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import PetAlert from '@/components/PetAlert'
import type { Pet } from '@/lib/types'

/**
 * แก้ข้อควรระวัง/หมายเหตุ ได้จากหน้าประวัติสัตว์เลย
 *
 * เดิมหน้านี้โชว์แถบเตือนอย่างเดียว ต้องเด้งไปหน้า "สัตว์เลี้ยง" แล้วค้นหาตัวเดิม
 * ถึงจะแก้ได้ — ซึ่งคนที่เพิ่งอ่านแถบเตือนอยู่ตรงหน้าจะหาไม่เจอ
 *
 * แก้ได้แค่สี่ช่องที่เกี่ยวกับการเตือน ส่วนชื่อ/พันธุ์/เจ้าของยังแก้ที่ฟอร์มเต็ม
 * หน้า "สัตว์เลี้ยง" เหมือนเดิม จะได้ไม่มีฟอร์มสองใบที่ต้องตามแก้ให้ตรงกัน
 */
const FIELDS = [
  {
    key: 'caution',
    label: 'ข้อควรระวัง',
    hint: 'ขึ้นเตือนทุกหน้าที่เจอสัตว์ตัวนี้',
    placeholder: 'เช่น ดุ กัด ต้องใส่ตะกร้อ / อุ้มท้องไม่ได้ / โทรแจ้งเจ้าของก่อนทำอะไร',
  },
  { key: 'allergies', label: 'แพ้ยา / แพ้อาหาร', hint: null, placeholder: '' },
  { key: 'chronic_conditions', label: 'โรคประจำตัว', hint: null, placeholder: '' },
  {
    key: 'notes',
    label: 'หมายเหตุ',
    hint: 'บันทึกทั่วไป ขึ้นให้เห็นแบบไม่ตะโกน',
    placeholder: '',
  },
] as const

type FieldKey = (typeof FIELDS)[number]['key']
type Draft = Record<FieldKey, string>

const draftFrom = (pet: Pet): Draft => ({
  caution: pet.caution ?? '',
  allergies: pet.allergies ?? '',
  chronic_conditions: pet.chronic_conditions ?? '',
  notes: pet.notes ?? '',
})

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function PetNotesEditor({ pet }: { pet: Pet }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(pet))

  function open() {
    setDraft(draftFrom(pet))
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('pets')
      .update({
        caution: draft.caution.trim() || null,
        allergies: draft.allergies.trim() || null,
        chronic_conditions: draft.chronic_conditions.trim() || null,
        notes: draft.notes.trim() || null,
      })
      .eq('id', pet.id)
    setSaving(false)
    if (error) {
      toast.error('บันทึกไม่สำเร็จ')
      return
    }
    toast.success('บันทึกแล้ว')
    setEditing(false)
    router.refresh()
  }

  if (editing) {
    return (
      <div className="mt-2 pt-3 border-t border-gray-100 space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {f.label}
              {f.hint && <span className="text-amber-600"> ({f.hint})</span>}
            </label>
            <input
              type="text"
              value={draft[f.key]}
              onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className={inputClass}
            />
          </div>
        ))}
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg"
          >
            <Check size={15} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            <X size={15} /> ยกเลิก
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-1 flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <PetAlert pet={pet} />
        {/* ไม่มีอะไรให้เตือน แถบก็ไม่ขึ้น — ต้องยังบอกให้เห็นว่ากรอกได้ตรงนี้ */}
        {!pet.caution?.trim() &&
          !pet.allergies?.trim() &&
          !pet.chronic_conditions?.trim() &&
          !pet.notes?.trim() && (
            <p className="text-sm text-gray-400">ยังไม่มีข้อควรระวังหรือหมายเหตุ</p>
          )}
      </div>
      <button
        onClick={open}
        className="shrink-0 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 rounded-lg px-2 py-1"
        title="แก้ข้อควรระวัง / แพ้ยา / โรคประจำตัว / หมายเหตุ"
      >
        <Pencil size={12} /> แก้ข้อควรระวัง
      </button>
    </div>
  )
}
