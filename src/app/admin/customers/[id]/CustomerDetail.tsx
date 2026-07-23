'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, ArrowLeft, Check, PawPrint, Plus, Receipt, Stethoscope, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { SPECIES_LABELS, VISIT_STATUS_LABELS, type Breed, type Customer, type Pet, type PetSpecies, type VisitStatus } from '@/lib/types'
import { ageAt, petAge } from '@/lib/pets'
import BreedSelect from '@/components/BreedSelect'

interface TxRow {
  id: string
  transaction_number: string
  created_at: string
  total: number
  status: 'completed' | 'cancelled'
}
interface VisitRow {
  id: string
  visit_number: string
  visit_date: string
  status: VisitStatus
  diagnosis: string | null
  pets: { name: string } | null
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'
const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

const emptyPet = {
  name: '',
  species: 'dog' as PetSpecies,
  breed: '',
  sex: '',
  birth_date: '',
  sterilized: false,
  sterilized_date: '',
  allergies: '',
  chronic_conditions: '',
}

export default function CustomerDetail({
  customer,
  pets,
  breeds,
  transactions,
  visits,
}: {
  customer: Customer
  pets: Pet[]
  breeds: Breed[]
  transactions: TxRow[]
  visits: VisitRow[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyPet)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function savePet() {
    if (!form.name.trim()) {
      toast.error('กรุณาใส่ชื่อสัตว์เลี้ยง')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('pets').insert({
      customer_id: customer.id,
      name: form.name.trim(),
      species: form.species,
      breed: form.breed.trim() || null,
      sex: form.sex || null,
      birth_date: form.birth_date || null,
      sterilized: form.sterilized,
      sterilized_date: form.sterilized ? (form.sterilized_date || null) : null,
      allergies: form.allergies.trim() || null,
      chronic_conditions: form.chronic_conditions.trim() || null,
    })
    setSaving(false)
    if (error) {
      toast.error('เพิ่มสัตว์เลี้ยงไม่สำเร็จ')
      return
    }
    toast.success(`เพิ่ม "${form.name.trim()}" แล้ว`)
    setForm(emptyPet)
    setAdding(false)
    router.refresh()
  }

  const sterilizedAge = form.sterilized_date ? ageAt(form.birth_date || null, form.sterilized_date) : null

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/admin/customers" className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
          <p className="text-sm text-gray-500 font-mono">{customer.phone}</p>
        </div>
      </div>

      {/* แต้ม / เครดิต / ยอดซื้อ */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">แต้มสะสม</p>
          <p className="text-xl font-bold text-blue-600">{customer.points.toLocaleString('th-TH')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">เครดิต</p>
          <p className="text-xl font-bold text-green-600">฿{money(customer.credit_balance)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">ยอดซื้อสะสม</p>
          <p className="text-xl font-bold text-gray-900">฿{money(customer.total_spent)}</p>
        </div>
      </div>

      {/* สัตว์เลี้ยง */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <PawPrint size={15} className="text-gray-400" /> สัตว์เลี้ยง ({pets.length})
          </h2>
          {!adding && (
            <button
              onClick={() => { setForm(emptyPet); setAdding(true) }}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={15} /> เพิ่มสัตว์เลี้ยง
            </button>
          )}
        </div>

        {adding && (
          <div className="bg-gray-50 rounded-xl p-4 mb-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>ชื่อสัตว์เลี้ยง *</label>
                <input type="text" autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
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
                <BreedSelect species={form.species} value={form.breed} onChange={(b) => set('breed', b)} breeds={breeds} className={inputClass} />
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
                <label className={labelClass}>แพ้ยา / แพ้อาหาร</label>
                <input type="text" value={form.allergies} onChange={(e) => set('allergies', e.target.value)} className={inputClass} />
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
                      <input type="date" value={form.sterilized_date} onChange={(e) => set('sterilized_date', e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      {sterilizedAge && <span className="text-xs text-gray-500">ทำตอนอายุ {sterilizedAge}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={savePet} disabled={saving} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                <Check size={14} /> {saving ? 'บันทึก...' : 'บันทึก'}
              </button>
              <button onClick={() => setAdding(false)} className="flex items-center gap-1.5 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg">
                <X size={14} /> ยกเลิก
              </button>
            </div>
          </div>
        )}

        {pets.length === 0 && !adding ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-6 text-center">ยังไม่มีสัตว์เลี้ยง</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pets.map((p) => (
              <Link key={p.id} href={`/admin/pets/${p.id}`} className="bg-white rounded-xl border border-gray-100 p-3 hover:border-blue-200 hover:shadow-sm transition-all">
                <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500">
                  {SPECIES_LABELS[p.species]}
                  {p.breed && ` · ${p.breed}`}
                  {p.sex && ` · ${p.sex === 'male' ? 'ผู้' : 'เมีย'}`}
                  {petAge(p.birth_date) && ` · ${petAge(p.birth_date)}`}
                </p>
                {(p.allergies || p.chronic_conditions) && (
                  <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    <AlertTriangle size={11} />
                    {[p.allergies, p.chronic_conditions].filter(Boolean).join(' · ')}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ประวัติการรักษา */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Stethoscope size={15} className="text-gray-400" /> ประวัติการรักษา
          </h2>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {visits.map((v) => (
              <Link key={v.id} href={`/admin/visits/${v.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-gray-50">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{v.diagnosis || v.pets?.name || 'ไม่ได้บันทึกการวินิจฉัย'}</p>
                  <p className="text-xs text-gray-400 font-mono">{v.visit_number} · {fmtDate(v.visit_date)}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{VISIT_STATUS_LABELS[v.status]}</span>
              </Link>
            ))}
            {visits.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีประวัติการรักษา</p>}
          </div>
        </div>

        {/* ประวัติการซื้อ */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Receipt size={15} className="text-gray-400" /> ประวัติการซื้อ / ค่ารักษา
          </h2>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {transactions.map((t) => (
              <a key={t.id} href={`/print/receipt/${t.id}`} target="_blank" className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-gray-50">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-gray-700">{t.transaction_number}</p>
                  <p className="text-xs text-gray-400">{fmtDate(t.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${t.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>฿{money(t.total)}</p>
                  {t.status === 'cancelled' && <p className="text-xs text-red-500">ยกเลิกแล้ว</p>}
                </div>
              </a>
            ))}
            {transactions.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีประวัติการซื้อ</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
