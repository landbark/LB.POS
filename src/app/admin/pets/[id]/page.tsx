import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, AlertTriangle, Stethoscope } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SPECIES_LABELS, VISIT_STATUS_LABELS, type Pet, type VisitStatus } from '@/lib/types'
import { ageAt, petAge } from '@/lib/pets'

const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export default async function PetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: pet } = await supabase.from('pets').select('*, customers(id, name, phone)').eq('id', id).single()
  if (!pet) notFound()
  const p = pet as Pet

  const { data: visits } = await supabase
    .from('visits')
    .select('id, visit_number, visit_date, status, diagnosis, treatment, weight')
    .eq('pet_id', id)
    .order('visit_date', { ascending: false })
    .limit(50)

  const detail = [
    p.breed,
    p.sex ? (p.sex === 'male' ? 'เพศผู้' : 'เพศเมีย') : null,
    petAge(p.birth_date),
    p.color,
  ].filter(Boolean).join(' · ')

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/admin/pets" className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
          <p className="text-sm text-gray-500">{SPECIES_LABELS[p.species]}{detail && ` · ${detail}`}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">เจ้าของ</span>
          {p.customers ? (
            <Link href={`/admin/customers/${p.customers.id}`} className="text-blue-600 hover:underline">
              {p.customers.name} <span className="text-gray-400 font-mono">{p.customers.phone}</span>
            </Link>
          ) : <span className="text-gray-400">—</span>}
        </div>
        {p.microchip && (
          <div className="flex justify-between"><span className="text-gray-500">ไมโครชิป</span><span className="font-mono">{p.microchip}</span></div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">ทำหมัน</span>
          <span>
            {p.sterilized
              ? p.sterilized_date
                ? `ทำแล้ว (${fmtDate(p.sterilized_date)}${ageAt(p.birth_date, p.sterilized_date) ? ` · ตอนอายุ ${ageAt(p.birth_date, p.sterilized_date)}` : ''})`
                : 'ทำแล้ว'
              : 'ยังไม่ทำ'}
          </span>
        </div>
        {(p.allergies || p.chronic_conditions) && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">
            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <span className="text-amber-800">
              {[p.allergies && `แพ้: ${p.allergies}`, p.chronic_conditions && `โรคประจำตัว: ${p.chronic_conditions}`].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
        {p.notes && <p className="text-gray-600">หมายเหตุ: {p.notes}</p>}
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        <Stethoscope size={15} className="text-gray-400" /> ประวัติการรักษา ({visits?.length ?? 0})
      </h2>
      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        {(visits ?? []).map((v) => (
          <Link key={v.id} href={`/admin/visits/${v.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50">
            <div className="min-w-0">
              <p className="text-sm text-gray-900 truncate">{v.diagnosis || v.treatment || 'ไม่ได้บันทึกการวินิจฉัย'}</p>
              <p className="text-xs text-gray-400 font-mono">
                {v.visit_number} · {fmtDate(v.visit_date)}{v.weight != null ? ` · ${v.weight} กก.` : ''}
              </p>
            </div>
            <span className="text-xs text-gray-400 shrink-0">{VISIT_STATUS_LABELS[v.status as VisitStatus]}</span>
          </Link>
        ))}
        {(!visits || visits.length === 0) && <p className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีประวัติการรักษา</p>}
      </div>
    </div>
  )
}
