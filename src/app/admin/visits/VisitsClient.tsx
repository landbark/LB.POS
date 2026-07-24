'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Clock, Plus, Search, Stethoscope, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { SPECIES_LABELS, VISIT_STATUS_LABELS, type Breed, type Pet, type PetSpecies, type Visit, type VisitStatus } from '@/lib/types'
import { ageAt, petAge } from '@/lib/pets'
import BreedSelect from '@/components/BreedSelect'

type OwnerOption = { id: string; name: string; phone: string }
type LastWeight = { weight: number; date: string }

const STATUS_STYLE: Record<VisitStatus, string> = {
  waiting: 'bg-purple-50 text-purple-700',
  open: 'bg-blue-50 text-blue-700',
  pending_payment: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

const emptyPetForm = {
  name: '',
  species: 'dog' as PetSpecies,
  breed: '',
  sex: '',
  birth_date: '',
  sterilized: false,
  sterilized_date: '',
  allergies: '',
}

export default function VisitsClient({
  visits,
  pets,
  customers,
  breeds,
  lastWeights,
  userId,
  role,
}: {
  visits: Visit[]
  pets: Pet[]
  customers: OwnerOption[]
  breeds: Breed[]
  lastWeights: Record<string, LastWeight>
  userId: string
  role: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<VisitStatus | ''>('')
  const [busy, setBusy] = useState(false)

  // ลงทะเบียน: เลือกสัตว์ → ชั่งน้ำหนัก → ส่งเข้าคิว (หรือหมอกดเริ่มตรวจเลย)
  const [registering, setRegistering] = useState(false)
  const [petQuery, setPetQuery] = useState('')
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null)
  const [weight, setWeight] = useState('')

  // ฟอร์มสัตว์ใหม่ (เคสแรกที่มาคลินิก — แคชเชียร์ลงทะเบียนหน้าเคาน์เตอร์ได้เลย)
  const [addingPet, setAddingPet] = useState(false)
  const [petForm, setPetForm] = useState(emptyPetForm)
  const [ownerId, setOwnerId] = useState('')
  const [ownerQuery, setOwnerQuery] = useState('')
  const [newOwner, setNewOwner] = useState({ name: '', phone: '' })
  const [addingOwner, setAddingOwner] = useState(false)

  const canExamine = role === 'vet' || role === 'admin'

  function closeModal() {
    setRegistering(false)
    setSelectedPet(null)
    setWeight('')
    setPetQuery('')
    setAddingPet(false)
    setPetForm(emptyPetForm)
    setOwnerId('')
    setOwnerQuery('')
    setNewOwner({ name: '', phone: '' })
    setAddingOwner(false)
  }

  async function createPet() {
    if (!petForm.name.trim()) {
      toast.error('กรุณาใส่ชื่อสัตว์เลี้ยง')
      return
    }

    const supabase = createClient()
    setBusy(true)

    let customerId = ownerId
    // เจ้าของหน้าใหม่ — สร้างลูกค้าให้เลย ไม่ต้องสลับไปหน้าลูกค้า
    if (addingOwner) {
      if (!newOwner.name.trim() || !newOwner.phone.trim()) {
        setBusy(false)
        toast.error('กรุณาใส่ชื่อและเบอร์โทรเจ้าของ')
        return
      }
      const { data, error } = await supabase
        .from('customers')
        .insert({ name: newOwner.name.trim(), phone: newOwner.phone.trim() })
        .select('id')
        .single()
      if (error || !data) {
        setBusy(false)
        toast.error(error?.code === '23505' ? 'มีลูกค้าเบอร์นี้อยู่แล้ว — ค้นหาจากช่องด้านบนแทน' : 'เพิ่มลูกค้าไม่สำเร็จ')
        return
      }
      customerId = data.id
    }

    if (!customerId) {
      setBusy(false)
      toast.error('กรุณาเลือกเจ้าของ')
      return
    }

    const { data: pet, error } = await supabase
      .from('pets')
      .insert({
        customer_id: customerId,
        name: petForm.name.trim(),
        species: petForm.species,
        breed: petForm.breed.trim() || null,
        sex: petForm.sex || null,
        birth_date: petForm.birth_date || null,
        sterilized: petForm.sterilized,
        sterilized_date: petForm.sterilized ? (petForm.sterilized_date || null) : null,
        allergies: petForm.allergies.trim() || null,
      })
      .select('*, customers(id, name, phone)')
      .single()

    setBusy(false)
    if (error || !pet) {
      toast.error('ลงทะเบียนสัตว์เลี้ยงไม่สำเร็จ')
      return
    }

    toast.success(`ลงทะเบียน "${pet.name}" แล้ว`)
    setSelectedPet(pet as Pet)
    setAddingPet(false)
    router.refresh()
  }

  // เปิดเวชระเบียน — แคชเชียร์ส่งเข้าคิว (waiting), หมอกดเริ่มตรวจได้เลย (open)
  async function createVisit(pet: Pet, startExam: boolean) {
    setBusy(true)
    const supabase = createClient()

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: visitNumber, error: numberError } = await supabase.rpc('next_visit_number')
      if (numberError || !visitNumber) break

      const { data, error } = await supabase
        .from('visits')
        .insert({
          visit_number: visitNumber,
          pet_id: pet.id,
          customer_id: pet.customer_id,
          vet_id: startExam ? userId : null,
          created_by: userId,
          weight: weight.trim() === '' ? null : Number(weight),
          status: startExam ? 'open' : 'waiting',
        })
        .select('id')
        .single()

      if (!error && data) {
        if (startExam) {
          router.push(`/admin/visits/${data.id}`)
          return
        }
        setBusy(false)
        closeModal()
        toast.success(`ส่ง "${pet.name}" เข้าคิวรอตรวจแล้ว`)
        router.refresh()
        return
      }
      // ชนเลขกับอีกเครื่อง — ขอเลขใหม่แล้วลองซ้ำ
      if (error?.code !== '23505') break
    }

    setBusy(false)
    toast.error('เปิดเวชระเบียนไม่สำเร็จ')
  }

  // หมอเรียกตรวจจากคิว
  async function startExam(visit: Visit) {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('visits')
      .update({ status: 'open', vet_id: visit.vet_id ?? userId })
      .eq('id', visit.id)
    setBusy(false)
    if (error) {
      toast.error('เริ่มตรวจไม่สำเร็จ')
      return
    }
    router.push(`/admin/visits/${visit.id}`)
  }

  // คิวรอตรวจ: มาก่อนตรวจก่อน (เรียงตามเวลาลงทะเบียนจากเก่าไปใหม่)
  const waiting = visits
    .filter((v) => v.status === 'waiting')
    .slice()
    .sort((a, b) => a.visit_date.localeCompare(b.visit_date))

  const q = query.trim().toLowerCase()
  const filtered = visits.filter((v) => {
    const matchStatus = !statusFilter || v.status === statusFilter
    const matchQuery = !q
      || v.visit_number.toLowerCase().includes(q)
      || (v.pets?.name ?? '').toLowerCase().includes(q)
      || (v.customers?.name ?? '').toLowerCase().includes(q)
      || (v.customers?.phone ?? '').includes(q)
      || (v.diagnosis ?? '').toLowerCase().includes(q)
    return matchStatus && matchQuery
  })

  const pq = petQuery.trim().toLowerCase()
  const petMatches = pets.filter((p) =>
    !pq
    || p.name.toLowerCase().includes(pq)
    || (p.customers?.name ?? '').toLowerCase().includes(pq)
    || (p.customers?.phone ?? '').includes(pq)
  ).slice(0, 12)

  const oq = ownerQuery.trim().toLowerCase()
  const ownerMatches = oq
    ? customers.filter((c) => c.name.toLowerCase().includes(oq) || c.phone.includes(oq)).slice(0, 6)
    : []
  const selectedOwner = customers.find((c) => c.id === ownerId)

  const lastWeight = selectedPet ? lastWeights[selectedPet.id] : undefined
  const weightDiff = lastWeight && weight.trim() !== '' ? Number(weight) - lastWeight.weight : null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ตรวจรักษา (OPD)</h1>
        <button
          onClick={() => { closeModal(); setRegistering(true) }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> ลงทะเบียนสัตว์ป่วย
        </button>
      </div>

      {/* คิวรอตรวจ */}
      {waiting.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Clock size={15} className="text-purple-500" /> คิวรอตรวจ ({waiting.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {waiting.map((v, i) => (
              <div key={v.id} className="bg-white rounded-xl border-2 border-purple-100 p-3 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {v.pets?.name ?? '—'}
                      {v.pets && <span className="ml-1.5 text-xs font-normal text-gray-400">{SPECIES_LABELS[v.pets.species]}</span>}
                    </p>
                    <p className="text-xs text-gray-500">{v.customers?.name ?? 'ไม่ระบุเจ้าของ'}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {v.weight != null && <span className="text-gray-600">{v.weight} กก. · </span>}
                      ลงทะเบียน {new Date(v.visit_date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                    </p>
                  </div>
                </div>
                {canExamine ? (
                  <button
                    onClick={() => startExam(v)}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                  >
                    <Stethoscope size={15} /> เริ่มตรวจ
                  </button>
                ) : (
                  <p className="text-center text-xs text-gray-400 py-1.5">รอสัตวแพทย์เรียกตรวจ</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเลขที่ / สัตว์ / เจ้าของ / การวินิจฉัย..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VisitStatus | '')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ทุกสถานะ</option>
          {Object.entries(VISIT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เลขที่</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สัตว์</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เจ้าของ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">การวินิจฉัย</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สัตวแพทย์</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((v) => (
              <tr key={v.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/admin/visits/${v.id}`)}>
                <td className="px-4 py-3 text-sm font-mono text-blue-600">
                  <Link href={`/admin/visits/${v.id}`}>{v.visit_number}</Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(v.visit_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                  <span className="block text-xs text-gray-400">
                    {new Date(v.visit_date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {v.pets?.name ?? '—'}
                  {v.pets && <span className="block text-xs text-gray-400">{SPECIES_LABELS[v.pets.species]}</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{v.customers?.name ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 max-w-[220px] truncate">{v.diagnosis || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{v.vet?.name ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[v.status]}`}>
                    {VISIT_STATUS_LABELS[v.status]}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                  {visits.length === 0 ? 'ยังไม่มีเวชระเบียน — กด "ลงทะเบียนสัตว์ป่วย" เพื่อเริ่ม' : 'ไม่พบรายการที่ค้นหา'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {registering && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                {(selectedPet || addingPet) && (
                  <button
                    onClick={() => { setSelectedPet(null); setAddingPet(false) }}
                    className="p-1 text-gray-400 hover:text-gray-700"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <Stethoscope size={18} className="text-gray-400" />
                {selectedPet ? 'ชั่งน้ำหนัก' : addingPet ? 'ลงทะเบียนสัตว์ใหม่' : 'เลือกสัตว์ป่วย'}
              </h2>
              <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* ขั้นที่ 1: เลือกสัตว์ */}
            {!selectedPet && !addingPet && (
              <>
                <input
                  type="text"
                  value={petQuery}
                  autoFocus
                  onChange={(e) => setPetQuery(e.target.value)}
                  placeholder="พิมพ์ชื่อสัตว์ / เจ้าของ / เบอร์โทร..."
                  className={`${inputClass} mb-3`}
                />

                <button
                  onClick={() => { setAddingPet(true); setPetForm({ ...emptyPetForm, name: petQuery.trim() }) }}
                  className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 hover:border-blue-300 text-gray-500 hover:text-blue-600 text-sm py-2 rounded-lg mb-3 transition-colors"
                >
                  <Plus size={15} /> ลงทะเบียนสัตว์ใหม่ (มาครั้งแรก)
                </button>

                <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                  {petMatches.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPet(p); setWeight('') }}
                      className="w-full text-left px-2 py-2.5 hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {p.name}
                        <span className="ml-2 text-xs text-gray-400">
                          {SPECIES_LABELS[p.species]}{p.breed ? ` · ${p.breed}` : ''}{petAge(p.birth_date) ? ` · ${petAge(p.birth_date)}` : ''}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {p.customers?.name ?? 'ไม่ระบุเจ้าของ'}
                        {p.customers?.phone && <span className="font-mono text-gray-400"> {p.customers.phone}</span>}
                      </p>
                    </button>
                  ))}
                  {petMatches.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-400">ไม่พบสัตว์เลี้ยง — ลงทะเบียนใหม่ได้จากปุ่มด้านบน</p>
                  )}
                </div>
              </>
            )}

            {/* ขั้นที่ 1ก: สัตว์ใหม่ */}
            {addingPet && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>ชื่อสัตว์เลี้ยง *</label>
                    <input type="text" autoFocus value={petForm.name} onChange={(e) => setPetForm({ ...petForm, name: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>ชนิด</label>
                    <select value={petForm.species} onChange={(e) => setPetForm({ ...petForm, species: e.target.value as PetSpecies })} className={inputClass}>
                      {Object.entries(SPECIES_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>พันธุ์</label>
                    <BreedSelect
                      species={petForm.species}
                      value={petForm.breed}
                      onChange={(breed) => setPetForm({ ...petForm, breed })}
                      breeds={breeds}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>เพศ</label>
                    <select value={petForm.sex} onChange={(e) => setPetForm({ ...petForm, sex: e.target.value })} className={inputClass}>
                      <option value="">— ไม่ระบุ —</option>
                      <option value="male">ผู้</option>
                      <option value="female">เมีย</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>วันเกิด</label>
                    <input type="date" value={petForm.birth_date} onChange={(e) => setPetForm({ ...petForm, birth_date: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>แพ้ยา / แพ้อาหาร</label>
                    <input type="text" value={petForm.allergies} onChange={(e) => setPetForm({ ...petForm, allergies: e.target.value })} className={inputClass} />
                  </div>
                  <div className="col-span-2 flex flex-wrap items-end gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                      <input type="checkbox" checked={petForm.sterilized} onChange={(e) => setPetForm({ ...petForm, sterilized: e.target.checked })} className="w-4 h-4" />
                      ทำหมันแล้ว
                    </label>
                    {petForm.sterilized && (
                      <div>
                        <label className={labelClass}>วันที่ทำหมัน</label>
                        <div className="flex items-center gap-2">
                          <input type="date" value={petForm.sterilized_date} onChange={(e) => setPetForm({ ...petForm, sterilized_date: e.target.value })} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          {petForm.sterilized_date && ageAt(petForm.birth_date || null, petForm.sterilized_date) && (
                            <span className="text-xs text-gray-500">ทำตอนอายุ {ageAt(petForm.birth_date || null, petForm.sterilized_date)}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>เจ้าของ *</label>
                  {addingOwner ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={newOwner.name} onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })} placeholder="ชื่อเจ้าของ" className={inputClass} />
                        <input type="tel" value={newOwner.phone} onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })} placeholder="เบอร์โทร" className={inputClass} />
                      </div>
                      <button onClick={() => setAddingOwner(false)} className="text-xs text-gray-500 hover:text-gray-700">
                        ← เลือกจากลูกค้าเดิมแทน
                      </button>
                    </div>
                  ) : selectedOwner ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
                        {selectedOwner.name} <span className="text-gray-400 font-mono">{selectedOwner.phone}</span>
                      </div>
                      <button onClick={() => { setOwnerId(''); setOwnerQuery('') }} className="p-2 text-gray-400 hover:text-red-600">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={ownerQuery}
                        onChange={(e) => setOwnerQuery(e.target.value)}
                        placeholder="พิมพ์ชื่อ / เบอร์โทรลูกค้า..."
                        className={inputClass}
                      />
                      {ownerMatches.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                          {ownerMatches.map((c) => (
                            <button key={c.id} onClick={() => { setOwnerId(c.id); setOwnerQuery('') }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                              {c.name} <span className="text-gray-400 font-mono">{c.phone}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => { setAddingOwner(true); setNewOwner({ name: '', phone: ownerQuery.trim() }) }}
                        className="mt-1.5 text-xs text-blue-600 hover:text-blue-700"
                      >
                        + เจ้าของมาใหม่ (เพิ่มลูกค้าเลย)
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={createPet}
                  disabled={busy}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm"
                >
                  {busy ? 'กำลังบันทึก...' : 'บันทึกแล้วไปชั่งน้ำหนัก'}
                </button>
              </div>
            )}

            {/* ขั้นที่ 2: น้ำหนัก + ส่งเข้าคิว */}
            {selectedPet && (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-semibold text-gray-900">{selectedPet.name}</p>
                  <p className="text-xs text-gray-500">
                    {SPECIES_LABELS[selectedPet.species]}
                    {selectedPet.breed && ` · ${selectedPet.breed}`}
                    {petAge(selectedPet.birth_date) && ` · ${petAge(selectedPet.birth_date)}`}
                    {' · '}
                    {selectedPet.customers?.name ?? 'ไม่ระบุเจ้าของ'}
                  </p>
                </div>

                <div>
                  <label className={labelClass}>น้ำหนักวันนี้ (กก.)</label>
                  <input
                    type="number"
                    step="0.01"
                    autoFocus
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder={lastWeight ? String(lastWeight.weight) : '0.00'}
                    className={inputClass}
                  />
                  {lastWeight ? (
                    <p className="text-xs text-gray-500 mt-1">
                      น้ำหนักล่าสุด {lastWeight.weight} กก.
                      <span className="text-gray-400">
                        {' '}(เมื่อ {new Date(lastWeight.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })})
                      </span>
                      {weightDiff !== null && weightDiff !== 0 && (
                        <span className={weightDiff > 0 ? 'text-orange-600' : 'text-blue-600'}>
                          {' '}· {weightDiff > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} {Math.abs(weightDiff).toFixed(2)} กก.
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">ยังไม่เคยชั่งน้ำหนักในระบบ</p>
                  )}
                </div>

                <button
                  onClick={() => createVisit(selectedPet, false)}
                  disabled={busy}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  {busy ? 'กำลังบันทึก...' : 'ส่งเข้าคิวรอตรวจ'}
                </button>
                {canExamine && (
                  <button
                    onClick={() => createVisit(selectedPet, true)}
                    disabled={busy}
                    className="w-full border-2 border-gray-200 hover:border-gray-300 disabled:opacity-50 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
                  >
                    เริ่มตรวจเลย (ข้ามคิว)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
