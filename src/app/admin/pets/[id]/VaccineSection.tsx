'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, Plus, Syringe, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { PetVaccination, Vaccine } from '@/lib/types'
import { addDaysISO, dueVaccinations } from '@/lib/vaccines'
import VaccineSelect from '@/components/VaccineSelect'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

export default function VaccineSection({
  petId,
  species,
  vaccinations,
  vaccines,
  userId,
}: {
  petId: string
  species: Vaccine['species']
  vaccinations: PetVaccination[]
  vaccines: Vaccine[]
  userId: string
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    vaccine_id: '',
    vaccine_name: '',
    dose_date: todayISO(),
    dose_label: '',
    next_due_date: '',
    lot_number: '',
  })

  function pickVaccine(v: Vaccine | null) {
    setForm((prev) => ({
      ...prev,
      vaccine_id: v?.id ?? '',
      vaccine_name: v?.name ?? '',
      // เดาวันนัดถัดไปจาก interval ของวัคซีน (แก้เองได้)
      next_due_date: v ? addDaysISO(prev.dose_date || todayISO(), v.default_interval_days) : prev.next_due_date,
    }))
  }

  async function save() {
    if (!form.vaccine_name) { toast.error('กรุณาเลือกวัคซีน'); return }
    if (!form.dose_date) { toast.error('กรุณาใส่วันที่ฉีด'); return }

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('pet_vaccinations').insert({
      pet_id: petId,
      vaccine_id: form.vaccine_id || null,
      vaccine_name: form.vaccine_name,
      dose_date: form.dose_date,
      dose_label: form.dose_label.trim() || null,
      next_due_date: form.next_due_date || null,
      lot_number: form.lot_number.trim() || null,
      vet_id: userId,
      created_by: userId,
    })
    setSaving(false)
    if (error) { toast.error('บันทึกวัคซีนไม่สำเร็จ'); return }
    toast.success('บันทึกวัคซีนแล้ว')
    setForm({ vaccine_id: '', vaccine_name: '', dose_date: todayISO(), dose_label: '', next_due_date: '', lot_number: '' })
    setAdding(false)
    router.refresh()
  }

  async function remove(v: PetVaccination) {
    if (!confirm(`ลบประวัติวัคซีน "${v.vaccine_name}" (${fmtDate(v.dose_date)})?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('pet_vaccinations').delete().eq('id', v.id)
    if (error) { toast.error('ลบไม่สำเร็จ'); return }
    toast.success('ลบแล้ว')
    router.refresh()
  }

  // เข็มที่ครบกำหนดกระตุ้น (ภายใน 30 วัน หรือเลยกำหนด)
  const due = dueVaccinations(
    vaccinations.map((v) => ({ pet_id: v.pet_id, vaccine_name: v.vaccine_name, dose_date: v.dose_date, next_due_date: v.next_due_date })),
    todayISO(),
    30,
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Syringe size={15} className="text-gray-400" /> ประวัติวัคซีน ({vaccinations.length})
        </h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
            <Plus size={15} /> บันทึกวัคซีน
          </button>
        )}
      </div>

      {due.length > 0 && (
        <div className="mb-3 space-y-1">
          {due.map((d) => (
            <div key={d.row.vaccine_name} className={`text-xs px-3 py-1.5 rounded-lg ${d.overdue ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
              {d.overdue ? '⚠️ เกินกำหนด' : '⏰ ครบกำหนด'}: {d.row.vaccine_name} — {d.row.next_due_date && fmtDate(d.row.next_due_date)}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="bg-gray-50 rounded-xl p-4 mb-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelClass}>วัคซีน *</label>
              <VaccineSelect species={species ?? 'other'} value={form.vaccine_id} onChange={pickVaccine} vaccines={vaccines} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>วันที่ฉีด *</label>
              <input type="date" value={form.dose_date} onChange={(e) => setForm({ ...form, dose_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>นัดกระตุ้นเข็มถัดไป</label>
              <input type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>เข็มที่ / รอบ</label>
              <input type="text" value={form.dose_label} onChange={(e) => setForm({ ...form, dose_label: e.target.value })} placeholder="เช่น เข็ม 1, กระตุ้นประจำปี" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Lot วัคซีน</label>
              <input type="text" value={form.lot_number} onChange={(e) => setForm({ ...form, lot_number: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
              <Check size={14} /> {saving ? 'บันทึก...' : 'บันทึก'}
            </button>
            <button onClick={() => setAdding(false)} className="flex items-center gap-1.5 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg">
              <X size={14} /> ยกเลิก
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        {vaccinations.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-gray-900">
                {v.vaccine_name}
                {v.dose_label && <span className="ml-1.5 text-xs text-gray-400">({v.dose_label})</span>}
              </p>
              <p className="text-xs text-gray-400">
                ฉีด {fmtDate(v.dose_date)}
                {v.next_due_date && ` · นัดถัดไป ${fmtDate(v.next_due_date)}`}
                {v.lot_number && ` · Lot ${v.lot_number}`}
              </p>
            </div>
            <button onClick={() => remove(v)} className="p-1.5 text-gray-300 hover:text-red-600 rounded shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {vaccinations.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีประวัติวัคซีน</p>}
      </div>
    </div>
  )
}
