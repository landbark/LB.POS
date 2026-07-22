'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Stethoscope, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { SPECIES_LABELS, VISIT_STATUS_LABELS, type Pet, type Visit, type VisitStatus } from '@/lib/types'
import { petAge } from '@/lib/pets'

const STATUS_STYLE: Record<VisitStatus, string> = {
  open: 'bg-blue-50 text-blue-700',
  pending_payment: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function VisitsClient({
  visits,
  pets,
  userId,
}: {
  visits: Visit[]
  pets: Pet[]
  userId: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<VisitStatus | ''>('')
  const [picking, setPicking] = useState(false)
  const [petQuery, setPetQuery] = useState('')
  const [creating, setCreating] = useState(false)

  // เปิดเวชระเบียนใหม่แล้วเข้าหน้าฟอร์มเลย — เลขที่มาจาก DB function เหมือนเลขที่บิลขาย
  async function createVisit(pet: Pet) {
    setCreating(true)
    const supabase = createClient()

    // ชนเลขกันได้ถ้าเปิดพร้อมกันสองเครื่อง — ขอเลขใหม่แล้วลองซ้ำ
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: visitNumber, error: numberError } = await supabase.rpc('next_visit_number')
      if (numberError || !visitNumber) {
        setCreating(false)
        toast.error('ออกเลขที่เวชระเบียนไม่สำเร็จ')
        return
      }

      const { data, error } = await supabase
        .from('visits')
        .insert({
          visit_number: visitNumber,
          pet_id: pet.id,
          customer_id: pet.customer_id,
          vet_id: userId,
          created_by: userId,
        })
        .select('id')
        .single()

      if (!error && data) {
        router.push(`/admin/visits/${data.id}`)
        return
      }
      if (error?.code !== '23505') break
    }

    setCreating(false)
    toast.error('เปิดเวชระเบียนไม่สำเร็จ')
  }

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ตรวจรักษา (OPD)</h1>
        <button
          onClick={() => { setPicking(true); setPetQuery('') }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> เปิดเวชระเบียนใหม่
        </button>
      </div>

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
                  {visits.length === 0 ? 'ยังไม่มีเวชระเบียน — กด "เปิดเวชระเบียนใหม่" เพื่อเริ่มตรวจ' : 'ไม่พบรายการที่ค้นหา'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* เลือกสัตว์ที่จะตรวจ */}
      {picking && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPicking(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Stethoscope size={18} className="text-gray-400" /> เลือกสัตว์ที่จะตรวจ
              </h2>
              <button onClick={() => setPicking(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              value={petQuery}
              autoFocus
              onChange={(e) => setPetQuery(e.target.value)}
              placeholder="พิมพ์ชื่อสัตว์ / เจ้าของ / เบอร์โทร..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {petMatches.map((p) => (
                <button
                  key={p.id}
                  disabled={creating}
                  onClick={() => createVisit(p)}
                  className="w-full text-left px-2 py-2.5 hover:bg-gray-50 disabled:opacity-50"
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
                <p className="py-8 text-center text-sm text-gray-400">
                  ไม่พบสัตว์เลี้ยง — เพิ่มที่เมนู &quot;สัตว์เลี้ยง&quot; ก่อน
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
