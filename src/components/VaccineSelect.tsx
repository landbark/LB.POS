'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { SPECIES_LABELS, type PetSpecies, type Vaccine } from '@/lib/types'
import { composeBreed } from '@/lib/pets'

interface Props {
  species: PetSpecies
  value: string
  onChange: (vaccine: Vaccine | null) => void
  vaccines: Vaccine[]
  className?: string
}

const ADD_OPTION = '__add__'

// เลือกวัคซีนจากแคตตาล็อก (กรองตามชนิดสัตว์ + วัคซีนที่ใช้ได้ทุกชนิด) + เพิ่มรายการใหม่ได้ตรงนี้
export default function VaccineSelect({ species, value, onChange, vaccines, className = '' }: Props) {
  const [list, setList] = useState(vaccines)
  const [adding, setAdding] = useState(false)
  const [nameEn, setNameEn] = useState('')
  const [nameTh, setNameTh] = useState('')
  const [interval, setInterval] = useState('365')
  const [saving, setSaving] = useState(false)

  // species ตรงกับสัตว์ หรือ null (ใช้ได้ทุกชนิด เช่น พิษสุนัขบ้า)
  const options = list.filter((v) => v.species === species || v.species === null)

  async function addVaccine() {
    const name = composeBreed(nameEn, nameTh)
    if (!name) {
      toast.error('กรอกชื่อวัคซีนอย่างน้อยหนึ่งภาษา')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('vaccines')
      .insert({
        name,
        name_en: nameEn.trim() || null,
        name_th: nameTh.trim() || null,
        species,
        default_interval_days: parseInt(interval) || 365,
      })
      .select()
      .single()
    setSaving(false)
    if (error) {
      toast.error(error.code === '23505' ? `มีวัคซีน "${name}" อยู่แล้ว` : 'เพิ่มวัคซีนไม่สำเร็จ')
      return
    }
    setList([...list, data])
    onChange(data)
    setNameEn('')
    setNameTh('')
    setAdding(false)
    toast.success(`เพิ่มวัคซีน "${name}" แล้ว`)
  }

  if (adding) {
    return (
      <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
        <div className="grid grid-cols-2 gap-2">
          <input type="text" autoFocus value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="English" className={className} />
          <input type="text" value={nameTh} onChange={(e) => setNameTh(e.target.value)} placeholder="ภาษาไทย" className={className} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">กระตุ้นทุก</span>
          <input type="number" value={interval} onChange={(e) => setInterval(e.target.value)} className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-gray-500">วัน ({SPECIES_LABELS[species]})</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={addVaccine} disabled={saving} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium">บันทึกวัคซีน</button>
          <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600">ยกเลิก</button>
        </div>
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === ADD_OPTION) { setAdding(true); return }
        onChange(list.find((v) => v.id === e.target.value) ?? null)
      }}
      className={className}
    >
      <option value="">— เลือกวัคซีน —</option>
      {options.map((v) => (
        <option key={v.id} value={v.id}>{v.name}</option>
      ))}
      <option value={ADD_OPTION}>+ เพิ่มวัคซีนใหม่...</option>
    </select>
  )
}
