'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import type { Breed, PetSpecies } from '@/lib/types'
import { composeBreed } from '@/lib/pets'

interface Props {
  species: PetSpecies
  value: string
  onChange: (breed: string) => void
  breeds: Breed[]
  className?: string
}

const ADD_OPTION = '__add__'

// เลือกพันธุ์จากรายการ (แยกตามชนิดสัตว์) + เพิ่มพันธุ์ใหม่ได้ตรงนี้เลย เหมือนหน่วยสินค้าในฟอร์มสินค้า
export default function BreedSelect({ species, value, onChange, breeds, className = '' }: Props) {
  const [list, setList] = useState(breeds)
  const [adding, setAdding] = useState(false)
  const [nameEn, setNameEn] = useState('')
  const [nameTh, setNameTh] = useState('')
  const [saving, setSaving] = useState(false)

  const options = list.filter((b) => b.species === species)
  // ค่าเดิมที่พิมพ์ไว้ก่อนมีตารางพันธุ์ (หรือพันธุ์ของชนิดอื่นตอนเปลี่ยนชนิด) ต้องไม่หายไปจาก dropdown
  const hasValue = !value || options.some((b) => b.name === value)

  async function addBreed() {
    const name = composeBreed(nameEn, nameTh)
    if (!name) {
      toast.error('กรอกชื่อพันธุ์อย่างน้อยหนึ่งภาษา')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('breeds')
      .insert({ species, name, name_en: nameEn.trim() || null, name_th: nameTh.trim() || null })
      .select()
      .single()
    setSaving(false)

    if (error) {
      toast.error(error.code === '23505' ? `มีพันธุ์ "${name}" อยู่แล้ว` : 'เพิ่มพันธุ์ไม่สำเร็จ')
      return
    }
    setList([...list, data])
    onChange(data.name)
    setNameEn('')
    setNameTh('')
    setAdding(false)
    toast.success(`เพิ่มพันธุ์ "${name}" แล้ว`)
  }

  if (adding) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            autoFocus
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setAdding(false) }}
            placeholder="English (เช่น Persian)"
            className={className}
          />
          <input
            type="text"
            value={nameTh}
            onChange={(e) => setNameTh(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addBreed() }
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="ภาษาไทย (เช่น เปอร์เซีย)"
            className={className}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addBreed}
            disabled={saving || (!nameEn.trim() && !nameTh.trim())}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium"
          >
            บันทึกพันธุ์
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNameEn(''); setNameTh('') }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === ADD_OPTION) {
          setAdding(true)
          return
        }
        onChange(e.target.value)
      }}
      className={className}
    >
      <option value="">— ไม่ระบุพันธุ์ —</option>
      {!hasValue && <option value={value}>{value}</option>}
      {options.map((b) => (
        <option key={b.id} value={b.name}>{b.name}</option>
      ))}
      <option value={ADD_OPTION}>+ เพิ่มพันธุ์ใหม่...</option>
    </select>
  )
}
