'use client'

import { SPECIES_LABELS, type Pet } from '@/lib/types'
import { petAge } from '@/lib/pets'

interface Store {
  name: string
  phone: string | null
}

/** เจ้าของเอาแต่ชื่อ ไม่เอานามสกุล — คำแรกของชื่อที่กรอกไว้ */
const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || '—'

/** เบอร์โทรโชว์แค่ 4 ตัวท้าย กันคนอื่นอ่านเบอร์ลูกค้าจากฉลากที่แปะไว้ */
function tailPhone(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `···${digits.slice(-4)}` : null
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p className="row">
      <span className="text-gray-500">{label} </span>
      {value}
    </p>
  )
}

export default function PetLabelView({ pet, store, weight }: { pet: Pet; store: Store | null; weight: number | null }) {
  const warning = [
    pet.allergies?.trim() && `แพ้: ${pet.allergies.trim()}`,
    pet.chronic_conditions?.trim() && `โรคประจำตัว: ${pet.chronic_conditions.trim()}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const phone = tailPhone(pet.customers?.phone)
  const age = petAge(pet.birth_date)

  // ฉลากมีใบเดียว ต้องใส่ให้พอดี — ตัวที่กรอกครบและมีแถบเตือนด้วยจะย่อฟอนต์ลงหนึ่งสเต็ป
  const extraRows = (pet.color ? 1 : 0) + (pet.microchip ? 1 : 0)
  const dense = Boolean(warning) && extraRows > 0
  const f = dense
    ? { base: '8pt', lh: 1.3, name: '13.5pt', species: '8.4pt', warn: '7.2pt', owner: '10pt' }
    : { base: '8.4pt', lh: 1.45, name: '15pt', species: '8.8pt', warn: '7.4pt', owner: '10.5pt' }

  return (
    <>
      <style>{`
        @page { size: 80mm 50mm; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .label { box-shadow: none !important; border: none !important; }
        }
        .label {
          width: 80mm; height: 50mm;
          padding: 2.5mm 3mm;
          box-sizing: border-box;
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .clamp2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <button onClick={() => window.close()} className="text-sm text-gray-500 hover:text-gray-700">
          ✕ ปิดหน้านี้
        </button>
        <span className="text-sm text-gray-400">ขนาด 80 × 50 มม. — เท่าฉลากยา</span>
        <button
          onClick={() => window.print()}
          className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          พิมพ์
        </button>
      </div>

      <div className="p-4 print:p-0">
        <div
          className="label bg-white border border-gray-300 shadow-sm print:shadow-none"
          style={{ fontSize: f.base, lineHeight: f.lh }}
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-gray-300 pb-0.5">
            <span className="font-bold truncate" style={{ fontSize: '8pt' }}>
              {store?.name ?? 'LANDBARK'}
            </span>
            <span className="shrink-0 text-gray-600" style={{ fontSize: '7pt' }}>
              {store?.phone ?? ''}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2 mt-0.5">
            <span className="font-bold leading-tight truncate" style={{ fontSize: f.name }}>
              {pet.name}
            </span>
            {pet.hn && (
              <span className="shrink-0 font-mono font-semibold text-gray-600" style={{ fontSize: '9pt' }}>
                HN {pet.hn}
              </span>
            )}
          </div>

          {/* ช่องว่างที่เหลือบนฉลากเกลี่ยให้รายละเอียดอยู่กลาง — สัตว์ที่กรอกข้อมูลไม่ครบจะได้ไม่ลอยอยู่ข้างบน */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-center">
            <p className="row text-gray-700" style={{ fontSize: f.species }}>
              {SPECIES_LABELS[pet.species]}
              {pet.breed && ` · ${pet.breed}`}
            </p>

            <div className="grid grid-cols-2 gap-x-2 mt-0.5">
              <Field label="เพศ" value={pet.sex ? (pet.sex === 'male' ? 'ผู้' : 'เมีย') : '—'} />
              <Field label="อายุ" value={age ?? '—'} />
              <Field label="ทำหมัน" value={pet.sterilized ? 'ทำแล้ว' : 'ยังไม่ทำ'} />
              <Field label="น้ำหนัก" value={weight != null ? `${weight} กก.` : '—'} />
              {pet.color && <Field label="สี" value={pet.color} />}
              {pet.microchip && (
                <p className="row col-span-2">
                  <span className="text-gray-500">ไมโครชิป </span>
                  <span className="font-mono">{pet.microchip}</span>
                </p>
              )}
            </div>
          </div>

          {warning && (
            <p
              className="clamp2 font-semibold text-gray-900 leading-snug border border-gray-400 rounded px-1 mb-0.5"
              style={{ fontSize: f.warn }}
            >
              ⚠ {warning}
            </p>
          )}

          <div className="flex items-baseline justify-between gap-2 border-t border-gray-300 pt-0.5">
            <span className="row font-bold" style={{ fontSize: f.owner }}>
              <span className="font-normal text-gray-500" style={{ fontSize: '8pt' }}>
                เจ้าของ{' '}
              </span>
              {firstName(pet.customers?.name)}
            </span>
            {phone && (
              <span className="shrink-0 font-semibold" style={{ fontSize: f.owner }}>
                <span className="font-normal text-gray-500" style={{ fontSize: '8pt' }}>
                  โทร{' '}
                </span>
                {phone}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
