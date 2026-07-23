'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import type { Breed, PetSpecies } from '@/lib/types'

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
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const options = list.filter((b) => b.species === species)
  // ค่าเดิมที่พิมพ์ไว้ก่อนมีตารางพันธุ์ (หรือพันธุ์ของชนิดอื่นตอนเปลี่ยนชนิด) ต้องไม่หายไปจาก dropdown
  const hasValue = !value || options.some((b) => b.name === value)

  async function addBreed() {
    const name = newName.trim()
    if (!name) return

    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('breeds')
      .insert({ species, name })
      .select()
      .single()
    setSaving(false)

    if (error) {
      toast.error(error.code === '23505' ? `มีพันธุ์ "${name}" อยู่แล้ว` : 'เพิ่มพันธุ์ไม่สำเร็จ')
      return
    }
    setList([...list, data])
    onChange(data.name)
    setNewName('')
    setAdding(false)
    toast.success(`เพิ่มพันธุ์ "${name}" แล้ว`)
  }

  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addBreed() }
            if (e.key === 'Escape') setAdding(false)
          }}
          placeholder="ชื่อพันธุ์ใหม่"
          className={className}
        />
        <button
          type="button"
          onClick={addBreed}
          disabled={saving || !newName.trim()}
          className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium"
        >
          บันทึก
        </button>
        <button
          type="button"
          onClick={() => { setAdding(false); setNewName('') }}
          className="shrink-0 px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600"
        >
          ยกเลิก
        </button>
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
