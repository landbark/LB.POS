'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2, X, Check, Search, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { SPECIES_LABELS, type Breed, type Pet, type PetSpecies } from '@/lib/types'
import { ageAt, petAge } from '@/lib/pets'
import BreedSelect from '@/components/BreedSelect'

type OwnerOption = { id: string; name: string; phone: string }

const emptyForm = {
  customer_id: '',
  name: '',
  species: 'dog' as PetSpecies,
  breed: '',
  sex: '',
  birth_date: '',
  color: '',
  microchip: '',
  sterilized: false,
  sterilized_date: '',
  allergies: '',
  chronic_conditions: '',
  notes: '',
}

type Form = typeof emptyForm

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

export default function PetsClient({
  pets,
  customers,
  breeds,
}: {
  pets: Pet[]
  customers: OwnerOption[]
  breeds: Breed[]
}) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  // ช่องค้นหาเจ้าของ (ลูกค้าเยอะเกินกว่าจะใส่ dropdown ยาวๆ)
  const [ownerQuery, setOwnerQuery] = useState('')

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit(p: Pet) {
    setEditingId(p.id)
    setShowAdd(false)
    setOwnerQuery('')
    setForm({
      customer_id: p.customer_id,
      name: p.name,
      species: p.species,
      breed: p.breed ?? '',
      sex: p.sex ?? '',
      birth_date: p.birth_date ?? '',
      color: p.color ?? '',
      microchip: p.microchip ?? '',
      sterilized: p.sterilized,
      sterilized_date: p.sterilized_date ?? '',
      allergies: p.allergies ?? '',
      chronic_conditions: p.chronic_conditions ?? '',
      notes: p.notes ?? '',
    })
  }

  function cancel() {
    setShowAdd(false)
    setEditingId(null)
    setForm(emptyForm)
    setOwnerQuery('')
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error('กรุณาใส่ชื่อสัตว์เลี้ยง')
      return
    }
    if (!form.customer_id) {
      toast.error('กรุณาเลือกเจ้าของ')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const payload = {
      customer_id: form.customer_id,
      name: form.name.trim(),
      species: form.species,
      breed: form.breed.trim() || null,
      sex: form.sex || null,
      birth_date: form.birth_date || null,
      color: form.color.trim() || null,
      microchip: form.microchip.trim() || null,
      sterilized: form.sterilized,
      // ยกเลิกติ๊กทำหมัน = ล้างวันที่ทิ้งด้วย ไม่ให้ค้างขัดกัน
      sterilized_date: form.sterilized ? (form.sterilized_date || null) : null,
      allergies: form.allergies.trim() || null,
      chronic_conditions: form.chronic_conditions.trim() || null,
      notes: form.notes.trim() || null,
    }

    const { error } = editingId
      ? await supabase.from('pets').update(payload).eq('id', editingId)
      : await supabase.from('pets').insert(payload)

    setLoading(false)
    if (error) {
      toast.error('เกิดข้อผิดพลาด')
      return
    }
    toast.success(editingId ? 'แก้ไขแล้ว' : 'เพิ่มสัตว์เลี้ยงแล้ว')
    cancel()
    router.refresh()
  }

  // ไม่ลบจริง — ประวัติการรักษาต้องอยู่ต่อ
  async function remove(p: Pet) {
    if (!confirm(`นำ "${p.name}" ออกจากทะเบียน?\nประวัติการรักษาเดิมยังอยู่ครบ`)) return
    const supabase = createClient()
    const { error } = await supabase.from('pets').update({ active: false }).eq('id', p.id)
    if (error) {
      toast.error('ลบไม่สำเร็จ')
      return
    }
    toast.success('นำออกจากทะเบียนแล้ว')
    router.refresh()
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? pets.filter((p) =>
        p.name.toLowerCase().includes(q)
        || (p.breed ?? '').toLowerCase().includes(q)
        || (p.customers?.name ?? '').toLowerCase().includes(q)
        || (p.customers?.phone ?? '').includes(q)
        || (p.microchip ?? '').includes(q)
      )
    : pets

  const oq = ownerQuery.trim().toLowerCase()
  const ownerMatches = oq
    ? customers.filter((c) => c.name.toLowerCase().includes(oq) || c.phone.includes(oq)).slice(0, 8)
    : []
  const selectedOwner = customers.find((c) => c.id === form.customer_id)
  const sterilizedAge = form.sterilized_date ? ageAt(form.birth_date || null, form.sterilized_date) : null

  const formCard = (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>ชื่อสัตว์เลี้ยง *</label>
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} placeholder="เช่น ข้าวปั้น" autoFocus />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>เจ้าของ *</label>
          {selectedOwner ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {selectedOwner.name} <span className="text-gray-400 font-mono">{selectedOwner.phone}</span>
              </div>
              <button onClick={() => { set('customer_id', ''); setOwnerQuery('') }} className="p-2 text-gray-400 hover:text-red-600">
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={ownerQuery}
                onChange={(e) => setOwnerQuery(e.target.value)}
                className={inputClass}
                placeholder="พิมพ์ชื่อ / เบอร์โทรลูกค้า..."
              />
              {ownerMatches.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {ownerMatches.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { set('customer_id', c.id); setOwnerQuery('') }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {c.name} <span className="text-gray-400 font-mono">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {oq && ownerMatches.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">ไม่พบลูกค้า — เพิ่มที่หน้า &quot;ลูกค้า&quot; ก่อน</p>
              )}
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>ชนิด</label>
          <select value={form.species} onChange={(e) => set('species', e.target.value as PetSpecies)} className={inputClass}>
            {Object.entries(SPECIES_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>พันธุ์</label>
          <BreedSelect
            species={form.species}
            value={form.breed}
            onChange={(breed) => set('breed', breed)}
            breeds={breeds}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>เพศ</label>
          <select value={form.sex} onChange={(e) => set('sex', e.target.value)} className={inputClass}>
            <option value="">— ไม่ระบุ —</option>
            <option value="male">ผู้</option>
            <option value="female">เมีย</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>วันเกิด</label>
          <input type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>สี</label>
          <input type="text" value={form.color} onChange={(e) => set('color', e.target.value)} className={inputClass} placeholder="เช่น น้ำตาลขาว" />
        </div>
        <div>
          <label className={labelClass}>ไมโครชิป</label>
          <input type="text" value={form.microchip} onChange={(e) => set('microchip', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>แพ้ยา / แพ้อาหาร</label>
          <input type="text" value={form.allergies} onChange={(e) => set('allergies', e.target.value)} className={inputClass} placeholder="เตือนตอนตรวจรักษา" />
        </div>
        <div>
          <label className={labelClass}>โรคประจำตัว</label>
          <input type="text" value={form.chronic_conditions} onChange={(e) => set('chronic_conditions', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>หมายเหตุ</label>
          <input type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputClass} />
        </div>

        <div className="sm:col-span-3 flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input type="checkbox" checked={form.sterilized} onChange={(e) => set('sterilized', e.target.checked)} className="w-4 h-4" />
            ทำหมันแล้ว
          </label>
          {form.sterilized && (
            <div>
              <label className={labelClass}>วันที่ทำหมัน</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={form.sterilized_date}
                  onChange={(e) => set('sterilized_date', e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {sterilizedAge && <span className="text-xs text-gray-500">ทำตอนอายุ {sterilizedAge}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={save} disabled={loading} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Check size={14} /> {loading ? 'บันทึก...' : 'บันทึก'}
        </button>
        <button onClick={cancel} className="flex items-center gap-1.5 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg">
          <X size={14} /> ยกเลิก
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">สัตว์เลี้ยง</h1>
        {!showAdd && !editingId && (
          <button
            onClick={() => { setShowAdd(true); setForm(emptyForm) }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} /> เพิ่มสัตว์เลี้ยง
          </button>
        )}
      </div>

      {showAdd && formCard}

      <div className="relative mb-4 max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อสัตว์ / เจ้าของ / เบอร์..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ชื่อ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ชนิด / พันธุ์</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เพศ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">อายุ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เจ้าของ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ข้อควรระวัง</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((p) => (
              editingId === p.id ? (
                <tr key={p.id}>
                  <td colSpan={7} className="px-4 py-3">{formCard}</td>
                </tr>
              ) : (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <Link href={`/admin/pets/${p.id}`} className="hover:text-blue-600">{p.name}</Link>
                    {p.sterilized && (
                      <span className="ml-2 text-xs text-gray-400">
                        ทำหมันแล้ว
                        {p.sterilized_date && (
                          <>
                            {' '}({new Date(p.sterilized_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                            {ageAt(p.birth_date, p.sterilized_date) && ` · ตอนอายุ ${ageAt(p.birth_date, p.sterilized_date)}`})
                          </>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {SPECIES_LABELS[p.species]}
                    {p.breed && <span className="text-gray-400"> · {p.breed}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {p.sex === 'male' ? 'ผู้' : p.sex === 'female' ? 'เมีย' : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{petAge(p.birth_date) ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {p.customers?.name ?? '—'}
                    {p.customers?.phone && <span className="block text-xs text-gray-400 font-mono">{p.customers.phone}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {(p.allergies || p.chronic_conditions) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={12} />
                        {[p.allergies, p.chronic_conditions].filter(Boolean).join(' · ')}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                        <Edit size={15} />
                      </button>
                      <button onClick={() => remove(p)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                  {pets.length === 0 ? 'ยังไม่มีสัตว์เลี้ยงในทะเบียน' : 'ไม่พบสัตว์เลี้ยงที่ค้นหา'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
