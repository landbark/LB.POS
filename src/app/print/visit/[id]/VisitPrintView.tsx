'use client'

import { useState } from 'react'
import PrintToolbar from '@/components/PrintToolbar'
import { SPECIES_LABELS, type StoreSettings, type Visit } from '@/lib/types'
import { petAge } from '@/lib/pets'

type PaperSize = 'a4' | 'a5'

const PAPER_CONFIG: Record<PaperSize, { page: string; margin: string; width: string; font: string }> = {
  a4: { page: 'A4', margin: '15mm', width: '650px', font: '14px' },
  a5: { page: 'A5', margin: '10mm', width: '480px', font: '13px' },
}

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

const thaiDate = (value: string) =>
  new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })

export default function VisitPrintView({ visit, store }: { visit: Visit; store: StoreSettings | null }) {
  const [size, setSize] = useState<PaperSize>('a5')
  const cfg = PAPER_CONFIG[size]
  const pet = visit.pets
  const items = visit.visit_items ?? []
  const total = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0)
  const serviceItems = items.filter((it) => it.products?.is_service)
  const rxItems = items.filter((it) => !it.products?.is_service)

  const vitals = [
    visit.weight != null && `น้ำหนัก ${visit.weight} กก.`,
    visit.temperature != null && `อุณหภูมิ ${visit.temperature} °F`,
    visit.heart_rate != null && `ชีพจร ${visit.heart_rate}/นาที`,
    visit.resp_rate != null && `การหายใจ ${visit.resp_rate}/นาที`,
  ].filter(Boolean) as string[]

  const section = (label: string, value: string | null) =>
    value ? (
      <div className="mb-3">
        <p className="text-gray-500" style={{ fontSize: '0.85em' }}>{label}</p>
        <p className="whitespace-pre-line" style={{ lineHeight: 1.5 }}>{value}</p>
      </div>
    ) : null

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* print-color-adjust: กันพื้นหลัง/เส้นกรอบหายตอนพิมพ์ */}
      <style>{`
        @page { size: ${cfg.page}; margin: ${cfg.margin}; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <PrintToolbar
        backHref={`/admin/visits/${visit.id}`}
        size={size}
        onSizeChange={(v) => setSize(v as PaperSize)}
        sizes={[
          { value: 'a5', label: 'A5' },
          { value: 'a4', label: 'A4' },
        ]}
      />

      <div className="flex justify-center py-6 print:py-0">
        <div className="bg-white shadow-lg print:shadow-none p-8" style={{ width: cfg.width, fontSize: cfg.font, maxWidth: '100%', lineHeight: 1.3 }}>
          <div className="flex items-start justify-between mb-5 gap-4">
            <div className="flex items-center gap-3">
              {store?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logo_url} alt={store.name} className="h-14 w-14 object-contain shrink-0" />
              )}
              <div>
                <p className="font-bold" style={{ fontSize: '1.2em' }}>{store?.name ?? 'LANDBARK'}</p>
                {store?.address && <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.85em' }}>{store.address}</p>}
                {store?.phone && <p className="text-gray-600" style={{ fontSize: '0.85em' }}>โทร {store.phone}</p>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold" style={{ fontSize: '1.2em' }}>ใบสรุปการรักษา</p>
              <p className="text-gray-500 font-mono" style={{ fontSize: '0.85em' }}>{visit.visit_number}</p>
              <p className="text-gray-500" style={{ fontSize: '0.85em' }}>{thaiDate(visit.visit_date)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-200" style={{ fontSize: '0.9em' }}>
            <div>
              <p className="text-gray-500 mb-0.5">สัตว์ป่วย</p>
              <p className="font-medium">{pet?.name ?? '—'}</p>
              <p className="text-gray-600" style={{ fontSize: '0.9em' }}>
                {pet && SPECIES_LABELS[pet.species]}
                {pet?.breed && ` · ${pet.breed}`}
                {pet?.sex && ` · ${pet.sex === 'male' ? 'ผู้' : 'เมีย'}`}
                {pet && petAge(pet.birth_date) && ` · ${petAge(pet.birth_date)}`}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">เจ้าของ</p>
              <p className="font-medium">{visit.customers?.name ?? '—'}</p>
              {visit.customers?.phone && <p className="text-gray-600" style={{ fontSize: '0.9em' }}>{visit.customers.phone}</p>}
            </div>
          </div>

          {vitals.length > 0 && (
            <p className="mb-3" style={{ fontSize: '0.9em' }}>
              <span className="text-gray-500">สัญญาณชีพ: </span>{vitals.join(' · ')}
            </p>
          )}

          {section('Chief Complaint', visit.symptoms)}
          {section('History Taking', visit.history_taking)}
          {section('Physical Examination', visit.physical_exam)}
          {section('Assessment / Diagnosis', visit.diagnosis)}
          {section('Treatment', visit.treatment)}

          {serviceItems.length > 0 && (
            <div className="mt-4">
              <p className="text-gray-500 mb-1" style={{ fontSize: '0.85em' }}>Service Fee</p>
              <table className="w-full" style={{ fontSize: '0.9em' }}>
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-1 font-medium">Item</th>
                    <th className="text-center py-1 font-medium w-16">Qty</th>
                    <th className="text-right py-1 font-medium w-20">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceItems.map((it, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1">{it.products?.name ?? '—'}</td>
                      <td className="py-1 text-center">{it.quantity} {it.products?.unit}</td>
                      <td className="py-1 text-right">{money(it.quantity * it.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rxItems.length > 0 && (
            <div className="mt-4">
              <p className="text-gray-500 mb-1" style={{ fontSize: '0.85em' }}>Prescription (Rx)</p>
              <table className="w-full" style={{ fontSize: '0.9em' }}>
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-1 font-medium">Item</th>
                    <th className="text-left py-1 font-medium">Dosage / Sig</th>
                    <th className="text-center py-1 font-medium w-16">Qty</th>
                    <th className="text-right py-1 font-medium w-20">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rxItems.map((it, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1">{it.products?.name ?? '—'}</td>
                      <td className="py-1 text-gray-600">{it.dosage ?? ''}</td>
                      <td className="py-1 text-center">{it.quantity} {it.products?.unit}</td>
                      <td className="py-1 text-right">{money(it.quantity * it.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {items.length > 0 && (
            <p className="mt-2 text-right font-bold" style={{ fontSize: '0.95em' }}>รวมทั้งสิ้น ฿{money(total)}</p>
          )}

          {section('Client Education', visit.client_education)}

          {visit.follow_up_date && (
            <p className="mt-4 font-medium" style={{ fontSize: '0.95em' }}>
              นัดติดตามอาการ: {thaiDate(visit.follow_up_date)}
            </p>
          )}
          {visit.notes && (
            <p className="mt-2 text-gray-600" style={{ fontSize: '0.9em' }}>หมายเหตุ: {visit.notes}</p>
          )}

          <div className="mt-10 flex justify-end">
            <div className="text-center" style={{ fontSize: '0.9em' }}>
              <div className="border-b border-gray-400 w-48 mb-1" />
              <p className="text-gray-600">{visit.vet?.name ?? 'สัตวแพทย์ผู้ตรวจ'}</p>
              <p className="text-gray-400" style={{ fontSize: '0.85em' }}>สัตวแพทย์ผู้ตรวจ</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
