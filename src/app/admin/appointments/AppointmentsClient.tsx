'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_LABELS, SPECIES_LABELS,
  type Appointment, type AppointmentStatus, type AppointmentType, type Pet,
} from '@/lib/types'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

const TYPE_STYLE: Record<AppointmentType, string> = {
  checkup: 'bg-blue-100 text-blue-700',
  vaccine: 'bg-green-100 text-green-700',
  surgery: 'bg-red-100 text-red-700',
  follow_up: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-600',
}

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  done: 'bg-green-50 text-green-700',
  missed: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

const emptyForm = {
  pet_id: '',
  date: '',
  time: '09:00',
  type: 'checkup' as AppointmentType,
  notes: '',
}

export default function AppointmentsClient({
  appointments,
  pets,
  userId,
}: {
  appointments: Appointment[]
  pets: Pet[]
  userId: string
}) {
  const router = useRouter()
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(localDate(today))

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [petQuery, setPetQuery] = useState('')
  const [saving, setSaving] = useState(false)

  // นัดต่อวัน (key = YYYY-MM-DD ตามเวลาเครื่อง)
  const byDate: Record<string, Appointment[]> = {}
  for (const a of appointments) {
    ;(byDate[localDate(new Date(a.scheduled_at))] ??= []).push(a)
  }

  function openNew(date?: string) {
    setEditing(null)
    setForm({ ...emptyForm, date: date ?? selectedDate })
    setPetQuery('')
    setModal(true)
  }

  function openEdit(a: Appointment) {
    setEditing(a)
    const d = new Date(a.scheduled_at)
    setForm({
      pet_id: a.pet_id,
      date: localDate(d),
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      type: a.type,
      notes: a.notes ?? '',
    })
    setPetQuery('')
    setModal(true)
  }

  async function save() {
    if (!form.pet_id) { toast.error('กรุณาเลือกสัตว์'); return }
    if (!form.date) { toast.error('กรุณาเลือกวันที่'); return }

    const pet = pets.find((p) => p.id === form.pet_id)
    const scheduled_at = new Date(`${form.date}T${form.time || '00:00'}`).toISOString()

    setSaving(true)
    const supabase = createClient()
    const payload = {
      pet_id: form.pet_id,
      customer_id: pet?.customer_id ?? null,
      scheduled_at,
      type: form.type,
      notes: form.notes.trim() || null,
    }
    const { error } = editing
      ? await supabase.from('appointments').update(payload).eq('id', editing.id)
      : await supabase.from('appointments').insert({ ...payload, created_by: userId })
    setSaving(false)

    if (error) { toast.error('บันทึกนัดไม่สำเร็จ'); return }
    toast.success(editing ? 'แก้ไขนัดแล้ว' : 'สร้างนัดแล้ว')
    setModal(false)
    setSelectedDate(form.date)
    router.refresh()
  }

  async function setStatus(a: Appointment, status: AppointmentStatus) {
    const supabase = createClient()
    const { error } = await supabase.from('appointments').update({ status }).eq('id', a.id)
    if (error) { toast.error('เปลี่ยนสถานะไม่สำเร็จ'); return }
    router.refresh()
  }

  async function remove(a: Appointment) {
    if (!confirm('ลบนัดนี้?')) return
    const supabase = createClient()
    const { error } = await supabase.from('appointments').delete().eq('id', a.id)
    if (error) { toast.error('ลบไม่สำเร็จ'); return }
    toast.success('ลบนัดแล้ว')
    setModal(false)
    router.refresh()
  }

  // ตารางปฏิทิน — เริ่มจากวันอาทิตย์ของสัปดาห์แรก
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const gridStart = new Date(firstDay)
  gridStart.setDate(1 - firstDay.getDay())
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
  const todayKey = localDate(today)

  const pq = petQuery.trim().toLowerCase()
  const petMatches = pq
    ? pets.filter((p) => p.name.toLowerCase().includes(pq) || (p.customers?.name ?? '').toLowerCase().includes(pq) || (p.customers?.phone ?? '').includes(pq)).slice(0, 8)
    : []
  const selectedPet = pets.find((p) => p.id === form.pet_id)

  const dayList = (byDate[selectedDate] ?? []).slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">นัดหมาย</h1>
        <button
          onClick={() => openNew()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> สร้างนัด
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ปฏิทิน */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-sm font-semibold text-gray-900">
              {month.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
            </h2>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-xs font-medium text-gray-400 py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d) => {
              const key = localDate(d)
              const inMonth = d.getMonth() === month.getMonth()
              const items = (byDate[key] ?? []).filter((a) => a.status !== 'cancelled')
              const isSelected = key === selectedDate
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  className={`min-h-14 rounded-lg p-1 text-left border transition-colors ${
                    isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-gray-50'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <span className={`text-xs ${key === todayKey ? 'font-bold text-blue-600' : 'text-gray-700'}`}>
                    {d.getDate()}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {items.slice(0, 2).map((a) => (
                      <div key={a.id} className={`text-[10px] px-1 py-0.5 rounded truncate ${TYPE_STYLE[a.type]}`}>
                        {a.pets?.name ?? '—'}
                      </div>
                    ))}
                    {items.length > 2 && <div className="text-[10px] text-gray-400 px-1">+{items.length - 2}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* รายการวันที่เลือก */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">
              {new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <button onClick={() => openNew(selectedDate)} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              <Plus size={13} /> เพิ่ม
            </button>
          </div>
          <div className="space-y-2">
            {dayList.map((a) => (
              <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => openEdit(a)} className="text-left min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {fmtTime(a.scheduled_at)} · {a.pets?.name ?? '—'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {a.customers?.name ?? 'ไม่ระบุเจ้าของ'}
                      {a.pets && ` · ${SPECIES_LABELS[a.pets.species]}`}
                    </p>
                    {a.notes && <p className="text-xs text-gray-400 mt-0.5">{a.notes}</p>}
                  </button>
                  <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ${TYPE_STYLE[a.type]}`}>
                    {APPOINTMENT_TYPE_LABELS[a.type]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  {a.status === 'scheduled' ? (
                    <>
                      <button onClick={() => setStatus(a, 'done')} className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white">มาแล้ว</button>
                      <button onClick={() => setStatus(a, 'missed')} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">ไม่มา</button>
                      <button onClick={() => setStatus(a, 'cancelled')} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">ยกเลิก</button>
                    </>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[a.status]}`}>
                      {APPOINTMENT_STATUS_LABELS[a.status]}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {dayList.length === 0 && (
              <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-6 text-center">ไม่มีนัดในวันนี้</p>
            )}
          </div>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'แก้ไขนัด' : 'สร้างนัด'}</h2>
              <button onClick={() => setModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelClass}>สัตว์ *</label>
                {selectedPet ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      {selectedPet.name}
                      <span className="text-gray-400"> · {selectedPet.customers?.name ?? 'ไม่ระบุเจ้าของ'}</span>
                    </div>
                    {!editing && (
                      <button onClick={() => { setForm({ ...form, pet_id: '' }); setPetQuery('') }} className="p-2 text-gray-400 hover:text-red-600"><X size={15} /></button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <input type="text" autoFocus value={petQuery} onChange={(e) => setPetQuery(e.target.value)} placeholder="พิมพ์ชื่อสัตว์ / เจ้าของ / เบอร์..." className={inputClass} />
                    {petMatches.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                        {petMatches.map((p) => (
                          <button key={p.id} onClick={() => { setForm({ ...form, pet_id: p.id }); setPetQuery('') }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                            {p.name} <span className="text-gray-400">· {p.customers?.name ?? 'ไม่ระบุ'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>วันที่ *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>เวลา</label>
                  <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputClass} />
                </div>
              </div>

              <div>
                <label className={labelClass}>ประเภท</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AppointmentType })} className={inputClass}>
                  {Object.entries(APPOINTMENT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>หมายเหตุ</label>
                <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} placeholder="เช่น วัคซีนพิษสุนัขบ้าเข็มที่ 2" />
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <button onClick={save} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {saving ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : 'สร้างนัด'}
              </button>
              {editing && (
                <button onClick={() => remove(editing)} className="ml-2 px-3 py-2.5 text-red-600 hover:bg-red-50 rounded-lg text-sm">ลบนัด</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
