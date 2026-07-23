'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Settings2, Syringe, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { SPECIES_LABELS, type PetSpecies, type Vaccine } from '@/lib/types'
import { composeBreed } from '@/lib/pets'

interface DueItem {
  petId: string
  petName: string
  ownerName: string | null
  ownerPhone: string | null
  vaccineName: string
  dueDate: string | null
  overdue: boolean
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

const emptyCat = { name_en: '', name_th: '', species: '' as '' | PetSpecies, interval: '365' }

export default function VaccinesClient({ items, vaccines }: { items: DueItem[]; vaccines: Vaccine[] }) {
  const router = useRouter()
  const [showCatalog, setShowCatalog] = useState(false)
  const [cat, setCat] = useState(emptyCat)
  const [saving, setSaving] = useState(false)

  async function addVaccine() {
    const name = composeBreed(cat.name_en, cat.name_th)
    if (!name) { toast.error('กรอกชื่อวัคซีนอย่างน้อยหนึ่งภาษา'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('vaccines').insert({
      name,
      name_en: cat.name_en.trim() || null,
      name_th: cat.name_th.trim() || null,
      species: cat.species || null,
      default_interval_days: parseInt(cat.interval) || 365,
    })
    setSaving(false)
    if (error) { toast.error(error.code === '23505' ? `มีวัคซีน "${name}" อยู่แล้ว` : 'เพิ่มไม่สำเร็จ'); return }
    toast.success(`เพิ่มวัคซีน "${name}" แล้ว`)
    setCat(emptyCat)
    router.refresh()
  }

  async function removeVaccine(v: Vaccine) {
    if (!confirm(`ลบ "${v.name}" ออกจากแคตตาล็อก?\nประวัติที่ฉีดไปแล้วยังอยู่ (เก็บชื่อไว้แล้ว)`)) return
    const supabase = createClient()
    const { error } = await supabase.from('vaccines').delete().eq('id', v.id)
    if (error) { toast.error('ลบไม่สำเร็จ'); return }
    toast.success('ลบแล้ว')
    router.refresh()
  }

  const overdue = items.filter((i) => i.overdue)
  const upcoming = items.filter((i) => !i.overdue)

  const card = (i: DueItem, idx: number) => (
    <Link
      key={`${i.petId}-${i.vaccineName}-${idx}`}
      href={`/admin/pets/${i.petId}`}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {i.petName} <span className="font-normal text-gray-400">· {i.ownerName ?? 'ไม่ระบุเจ้าของ'}{i.ownerPhone ? ` ${i.ownerPhone}` : ''}</span>
        </p>
        <p className="text-xs text-gray-500">{i.vaccineName}</p>
      </div>
      <span className={`shrink-0 text-xs font-medium ${i.overdue ? 'text-red-600' : 'text-amber-600'}`}>
        {i.dueDate && fmtDate(i.dueDate)}
      </span>
    </Link>
  )

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Syringe size={22} className="text-gray-400" /> วัคซีน
        </h1>
        <button
          onClick={() => setShowCatalog(true)}
          className="flex items-center gap-2 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
        >
          <Settings2 size={15} /> จัดการรายการวัคซีน
        </button>
      </div>

      {overdue.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-red-700 mb-2">⚠️ เกินกำหนด ({overdue.length})</h2>
          <div className="bg-white rounded-xl border border-red-100 divide-y divide-gray-50">
            {overdue.map(card)}
          </div>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-amber-700 mb-2">⏰ ครบกำหนดใน 45 วัน ({upcoming.length})</h2>
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {upcoming.map(card)}
          {upcoming.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">ไม่มีวัคซีนครบกำหนดเร็วๆ นี้</p>}
        </div>
      </div>

      {showCatalog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCatalog(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">รายการวัคซีน</h2>
              <button onClick={() => setShowCatalog(false)} className="p-1.5 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={cat.name_en} onChange={(e) => setCat({ ...cat, name_en: e.target.value })} placeholder="English" className={inputClass} />
                <input type="text" value={cat.name_th} onChange={(e) => setCat({ ...cat, name_th: e.target.value })} placeholder="ภาษาไทย" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={cat.species} onChange={(e) => setCat({ ...cat, species: e.target.value as '' | PetSpecies })} className={inputClass}>
                  <option value="">ทุกชนิด</option>
                  {Object.entries(SPECIES_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 shrink-0">กระตุ้นทุก</span>
                  <input type="number" value={cat.interval} onChange={(e) => setCat({ ...cat, interval: e.target.value })} className={inputClass} />
                  <span className="text-xs text-gray-500 shrink-0">วัน</span>
                </div>
              </div>
              <button onClick={addVaccine} disabled={saving} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                <Plus size={14} /> เพิ่มวัคซีน
              </button>
            </div>

            <div className="divide-y divide-gray-50">
              {vaccines.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm text-gray-800">{v.name}</p>
                    <p className="text-xs text-gray-400">
                      {v.species ? SPECIES_LABELS[v.species] : 'ทุกชนิด'} · กระตุ้นทุก {v.default_interval_days} วัน
                    </p>
                  </div>
                  <button onClick={() => removeVaccine(v)} className="p-1.5 text-gray-300 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                </div>
              ))}
              {vaccines.length === 0 && <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีวัคซีนในระบบ</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
