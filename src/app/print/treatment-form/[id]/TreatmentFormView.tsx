'use client'

import { useState } from 'react'
import PrintToolbar from '@/components/PrintToolbar'
import { SPECIES_LABELS, type Pet, type StoreSettings } from '@/lib/types'
import { petAge } from '@/lib/pets'

const todayTh = () => new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })

const field = 'border-0 border-b border-gray-400 bg-transparent focus:outline-none focus:border-blue-500 px-1'
const area = 'w-full border border-gray-300 rounded bg-transparent focus:outline-none focus:border-blue-500 px-2 py-1 resize-none print:border-gray-400'

export default function TreatmentFormView({ pet, store, weight }: { pet: Pet; store: StoreSettings | null; weight: number | null }) {
  const [size, setSize] = useState<'a4'>('a4')

  const petLine = [
    SPECIES_LABELS[pet.species],
    pet.breed,
    pet.sex ? (pet.sex === 'male' ? 'เพศผู้' : 'เพศเมีย') : null,
    petAge(pet.birth_date),
  ].filter(Boolean).join(' · ')

  const warnings = [pet.allergies && `แพ้: ${pet.allergies}`, pet.chronic_conditions && `โรคประจำตัว: ${pet.chronic_conditions}`]
    .filter(Boolean).join(' · ')

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @page { size: A4; margin: 15mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          input, textarea { color: #000 !important; }
        }
      `}</style>

      <PrintToolbar backHref={`/admin/pets/${pet.id}`} size={size} onSizeChange={(v) => setSize(v as 'a4')} sizes={[{ value: 'a4', label: 'A4' }]} />

      <div className="flex justify-center py-6 print:py-0">
        <div className="bg-white shadow-lg print:shadow-none p-10 print:p-0" style={{ width: '720px', maxWidth: '100%', fontSize: '14px', lineHeight: 1.6 }}>
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b-2 border-gray-800">
            <div className="flex items-center gap-3">
              {store?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logo_url} alt={store.name} className="h-14 w-14 object-contain shrink-0" />
              )}
              <div>
                <p className="font-bold" style={{ fontSize: '1.2em' }}>{store?.name ?? 'LANDBARK'}</p>
                {store?.address && <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.82em' }}>{store.address}</p>}
                {store?.phone && <p className="text-gray-600" style={{ fontSize: '0.82em' }}>โทร {store.phone}</p>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold" style={{ fontSize: '1.1em' }}>ใบสรุปการรักษา</p>
              <p className="text-gray-500" style={{ fontSize: '0.82em' }}>วันที่ <input className={field} style={{ width: '120px' }} defaultValue={todayTh()} /></p>
            </div>
          </div>

          {/* สัตว์ + เจ้าของ */}
          <div className="mb-3 border border-gray-200 rounded-lg p-3" style={{ fontSize: '0.95em' }}>
            <p><span className="text-gray-600">ชื่อสัตว์:</span> <input className={field} style={{ width: '200px' }} defaultValue={pet.name} />
              <span className="text-gray-600 ml-3">น้ำหนัก:</span> <input className={field} style={{ width: '70px' }} defaultValue={weight ? String(weight) : ''} /> กก.</p>
            <p className="mt-1"><span className="text-gray-600">ชนิด/พันธุ์/เพศ/อายุ:</span> <input className={field} style={{ width: '360px' }} defaultValue={petLine} /></p>
            <p className="mt-1"><span className="text-gray-600">เจ้าของ:</span> <input className={field} style={{ width: '220px' }} defaultValue={pet.customers?.name ?? ''} />
              <span className="text-gray-600 ml-3">โทร:</span> <input className={field} style={{ width: '140px' }} defaultValue={pet.customers?.phone ?? ''} /></p>
            {warnings && <p className="mt-1 text-amber-700" style={{ fontSize: '0.9em' }}>⚠️ {warnings}</p>}
          </div>

          {/* สัญญาณชีพ */}
          <div className="grid grid-cols-4 gap-3 mb-3" style={{ fontSize: '0.92em' }}>
            <p><span className="text-gray-600">อุณหภูมิ</span> <input className={field} style={{ width: '48px' }} /> °F</p>
            <p><span className="text-gray-600">ชีพจร</span> <input className={field} style={{ width: '48px' }} /></p>
            <p><span className="text-gray-600">หายใจ</span> <input className={field} style={{ width: '48px' }} /></p>
            <p><span className="text-gray-600">อื่นๆ</span> <input className={field} style={{ width: '56px' }} /></p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="mb-1"><span className="text-gray-600">อาการที่พามา:</span></p>
              <textarea rows={2} className={area} />
            </div>
            <div>
              <p className="mb-1"><span className="text-gray-600">การวินิจฉัย:</span></p>
              <textarea rows={2} className={area} />
            </div>
            <div>
              <p className="mb-1"><span className="text-gray-600">การรักษา / หัตถการ:</span></p>
              <textarea rows={3} className={area} />
            </div>
            <div>
              <p className="mb-1"><span className="text-gray-600">ยา / คำแนะนำการดูแลต่อ:</span></p>
              <textarea rows={4} className={area} />
            </div>
          </div>

          <div className="flex items-end justify-between mt-6" style={{ fontSize: '0.9em' }}>
            <p><span className="text-gray-600">นัดครั้งถัดไป:</span> <input className={field} style={{ width: '180px' }} /></p>
            <div className="text-center" style={{ width: '240px' }}>
              <div className="border-b border-gray-500 mb-1 h-6" />
              <p className="text-gray-600">ลงชื่อสัตวแพทย์</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
