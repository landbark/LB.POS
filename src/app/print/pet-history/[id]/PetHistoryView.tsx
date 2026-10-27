'use client'

import { SPECIES_LABELS, type Pet } from '@/lib/types'
import { petAge } from '@/lib/pets'

interface Visit {
  id: string
  visit_date: string
  diagnosis: string | null
  treatment: string | null
  weight: number | null
}

interface Vaccine {
  vaccine_name: string
  dose_date: string
  next_due_date: string | null
}

interface Store {
  name: string
  phone: string | null
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' })

/** เจ้าของเอาแต่ชื่อ ไม่เอานามสกุล — คำแรกของชื่อที่กรอกไว้ */
const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || '—'

/** เบอร์โทรโชว์แค่ 4 ตัวท้าย กันคนอื่นอ่านเบอร์ลูกค้าจากสติกเกอร์ */
function tailPhone(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `···${digits.slice(-4)}` : null
}

/** จำนวนบรรทัดประวัติที่ลงในสติกเกอร์ใบหนึ่งได้ — ใบแรกเสียที่ให้หัวข้อมูลสัตว์ */
const ROWS_PER_LABEL = 10

export default function PetHistoryView({
  pet,
  store,
  visits,
  lastVaccine,
}: {
  pet: Pet
  store: Store | null
  visits: Visit[]
  lastVaccine: Vaccine | null
}) {
  const warning = [
    pet.allergies?.trim() && `แพ้: ${pet.allergies.trim()}`,
    pet.chronic_conditions?.trim() && `โรคประจำตัว: ${pet.chronic_conditions.trim()}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const detail = [
    SPECIES_LABELS[pet.species],
    pet.breed,
    petAge(pet.birth_date),
    pet.sex ? (pet.sex === 'male' ? 'ผู้' : 'เมีย') : null,
    pet.sterilized ? 'ทำหมันแล้ว' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const phone = tailPhone(pet.customers?.phone)

  // หัวใบแรกกินที่ประมาณ 3 บรรทัด บวกอีกบรรทัดถ้ามีแถบเตือน/วัคซีน
  const firstRows = Math.max(3, ROWS_PER_LABEL - 3 - (warning ? 1 : 0) - (lastVaccine ? 1 : 0))

  const pages: Visit[][] = []
  if (visits.length === 0) {
    pages.push([])
  } else {
    pages.push(visits.slice(0, firstRows))
    for (let i = firstRows; i < visits.length; i += ROWS_PER_LABEL) {
      pages.push(visits.slice(i, i + ROWS_PER_LABEL))
    }
  }

  return (
    <>
      <style>{`
        @page { size: 80mm 50mm; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .label { page-break-after: always; box-shadow: none !important; border: none !important; }
          .label:last-child { page-break-after: auto; }
        }
        .label {
          width: 80mm; height: 50mm;
          padding: 2.5mm 3mm;
          box-sizing: border-box;
          display: flex; flex-direction: column;
          font-size: 7.4pt; line-height: 1.3;
          overflow: hidden;
        }
        .row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <button onClick={() => window.close()} className="text-sm text-gray-500 hover:text-gray-700">
          ✕ ปิดหน้านี้
        </button>
        <span className="text-sm text-gray-400">
          ขนาด 80 × 50 มม. · {visits.length} ครั้ง · {pages.length} ใบ
        </span>
        <button
          onClick={() => window.print()}
          className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          พิมพ์
        </button>
      </div>

      <div className="p-4 flex flex-wrap gap-4 print:p-0 print:gap-0">
        {pages.map((rows, page) => (
          <div key={page} className="label bg-white border border-gray-300 shadow-sm print:shadow-none">
            <div className="flex items-baseline justify-between gap-2 border-b border-gray-300 pb-0.5">
              <span className="font-bold truncate" style={{ fontSize: '8pt' }}>
                {store?.name ?? 'LANDBARK'} · ประวัติสัตว์ป่วย
              </span>
              <span className="shrink-0 text-gray-600" style={{ fontSize: '6.6pt' }}>
                {pages.length > 1 ? `${page + 1}/${pages.length}` : ''}
              </span>
            </div>

            {page === 0 ? (
              <>
                <p className="font-bold leading-tight truncate mt-0.5" style={{ fontSize: '10pt' }}>
                  {pet.name}
                  {pet.hn && (
                    <span className="ml-1 font-semibold text-gray-500" style={{ fontSize: '7.4pt' }}>
                      HN {pet.hn}
                    </span>
                  )}
                </p>
                <p className="row text-gray-700" style={{ fontSize: '6.8pt' }}>
                  {detail}
                </p>
                <p className="row text-gray-700">
                  เจ้าของ: <b>{firstName(pet.customers?.name)}</b>
                  {phone && <span className="ml-1 text-gray-500">โทร {phone}</span>}
                </p>
                {lastVaccine && (
                  <p className="row text-gray-600" style={{ fontSize: '6.8pt' }}>
                    วัคซีนล่าสุด: {lastVaccine.vaccine_name} {fmtDate(lastVaccine.dose_date)}
                    {lastVaccine.next_due_date && ` · นัดถัดไป ${fmtDate(lastVaccine.next_due_date)}`}
                  </p>
                )}
                {warning && (
                  <p className="row font-semibold text-gray-900 border border-gray-400 rounded px-1 mt-0.5" style={{ fontSize: '6.8pt' }}>
                    ⚠ {warning}
                  </p>
                )}
                <div className="border-t border-gray-300 mt-1 mb-0.5" />
              </>
            ) : (
              <p className="row text-gray-600 mt-0.5 mb-0.5" style={{ fontSize: '6.8pt' }}>
                {pet.name}
                {pet.hn && ` HN ${pet.hn}`} · ประวัติ (ต่อ)
              </p>
            )}

            <div className="flex-1 overflow-hidden">
              {rows.map((v) => (
                <p key={v.id} className="row">
                  <span className="text-gray-600">{fmtDate(v.visit_date)}</span>
                  {v.weight != null && <span className="text-gray-600"> · {v.weight} กก.</span>}
                  <span> · {v.diagnosis || v.treatment || 'ไม่ได้บันทึกการวินิจฉัย'}</span>
                </p>
              ))}
              {rows.length === 0 && <p className="text-gray-400">ยังไม่มีประวัติการรักษา</p>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
