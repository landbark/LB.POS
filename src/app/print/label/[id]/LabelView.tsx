'use client'

import { useState } from 'react'
import { sigText, labelName, labelIndication, isInjectionUnit } from '@/lib/sig'
import { isVaccine } from '@/lib/clinic'
import type { Frequency, FoodTiming } from '@/lib/types'

interface Item {
  id: string
  quantity: number
  dosage: string | null
  dose_amount: number | null
  frequency: Frequency | null
  frequency_hours: number | null
  food_timing: FoodTiming | null
  duration_days: number | null
  dose_times: string | null
  products: {
    name: string
    unit: string
    is_service: boolean
    is_vaccine: boolean | null
    categories: { is_vaccine: boolean | null } | null
    label_name: string | null
    label_name_en: string | null
    indication: string | null
    indication_en: string | null
    brand: string | null
  } | null
}

interface Visit {
  id: string
  visit_number: string
  visit_date: string
  pets: { name: string; species: string; hn: string | null } | null
  customers: { name: string; phone: string | null } | null
  vet: { name: string } | null
  visit_items: Item[]
}

interface Store {
  name: string
  address: string | null
  phone: string | null
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

/**
 * ยาฉีดกับวัคซีนหมอให้ที่ร้านเอง ไม่ได้ให้เจ้าของเอากลับไปใช้ — ไม่ต้องมีฉลากติดซอง
 * ไม่ตัดออกจากรายการ แค่ไม่ติ๊กให้ เผื่อของบางตัวขายเป็น ml. แต่เป็นยากิน (เช่นยาน้ำเชื่อม)
 * หมอจะได้ติ๊กพิมพ์เองได้
 */
const administeredHere = (item: Item) =>
  isInjectionUnit(item.products?.unit) || (item.products ? isVaccine(item.products) : false)

export default function LabelView({ visit, store }: { visit: Visit; store: Store | null }) {
  const [lang, setLang] = useState<'th' | 'en'>('th')
  // ยาเท่านั้น ค่าบริการไม่ต้องมีฉลาก
  const drugs = (visit.visit_items ?? []).filter((i) => i.products && !i.products.is_service)
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set(drugs.filter(administeredHere).map((d) => d.id)))
  const toPrint = drugs.filter((d) => !skipped.has(d.id))

  function toggle(id: string) {
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const t = lang === 'th'
    ? { pet: 'ชื่อสัตว์', owner: 'เจ้าของ', qty: 'จำนวนจ่าย', vet: 'สัตวแพทย์', date: 'วันที่', indication: 'สรรพคุณ' }
    : { pet: 'Patient', owner: 'Owner', qty: 'Dispensed', vet: 'Vet', date: 'Date', indication: 'Indication' }

  return (
    <>
      <style>{`
        @page { size: 80mm 50mm; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          /* ตอนพิมพ์ต้องเลิกเป็น flex ก่อน ไม่งั้น Chrome ไม่สนใจ page-break-after ของลูก */
          .labels { display: block !important; }
          .label { page-break-after: always; box-shadow: none !important; border: none !important; }
          .label:last-child { page-break-after: auto; }
        }
        .clamp2 {
          display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .clamp1 {
          display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1;
          overflow: hidden;
        }
        .label {
          width: 80mm; height: 50mm;
          padding: 2.5mm 3mm;
          box-sizing: border-box;
          display: flex; flex-direction: column;
          font-size: 8.4pt;
          /* 1.7 ไม่ใช่เรื่องสวยงาม แต่เป็นค่าที่วัดมา — Sarabun เวลาวรรณยุกต์ซ้อนบนสระบน
             ("มีมี่" "ผู้ป่วย" "กึ่ง") หมึกพุ่ง 1.22 em เหนือเส้นฐานที่น้ำหนักปกติ
             และ 1.25 em ที่ตัวหนา กล่อง overflow:hidden จะตัดหัววรรณยุกต์ถ้า line-height
             ต่ำกว่า 1.60 (ปกติ) หรือ 1.66 (หนา) — วัดในเบราว์เซอร์จริง ไม่ได้กะเอา
             ค่าเดิม 1.32 ตัดหัวชื่อยาไป 2.18px ทุกใบที่ชื่อยามีวรรณยุกต์ซ้อน
             ทุกบรรทัดบนฉลากนี้เป็นไทยได้หมดและเป็น overflow:hidden หมด เลยยกพื้นทั้งใบ
             ทีเดียว แล้วเลิกใส่ leading-tight/leading-snug ทับเป็นราย ๆ */
          line-height: 1.7;
          overflow: hidden;
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <button onClick={() => window.close()} className="text-sm text-gray-500 hover:text-gray-700">✕ ปิดหน้านี้</button>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={lang === 'en'} onChange={(e) => setLang(e.target.checked ? 'en' : 'th')} />
          ฉลากภาษาอังกฤษ
        </label>
        <span className="text-sm text-gray-400">ขนาด 80 × 50 มม. · {toPrint.length} ฉลาก</span>
        <button
          onClick={() => window.print()}
          disabled={toPrint.length === 0}
          className="ml-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          พิมพ์
        </button>
      </div>

      {drugs.length === 0 && (
        <p className="no-print p-6 text-sm text-gray-400">ใบนี้ไม่มีรายการยา — มีแต่ค่าบริการ</p>
      )}

      {drugs.length > 0 && drugs.some(administeredHere) && (
        <p className="no-print px-4 pt-3 text-xs text-gray-400">
          ยาฉีดกับวัคซีนไม่ติ๊กให้อัตโนมัติ เพราะฉีดที่ร้าน ไม่ได้เอากลับบ้าน — ถ้าต้องการฉลากก็ติ๊กเองได้
        </p>
      )}

      {drugs.length > 0 && (
        <div className="no-print px-4 pt-3 flex flex-wrap gap-2">
          {drugs.map((d) => (
            <label key={d.id} className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1">
              <input type="checkbox" checked={!skipped.has(d.id)} onChange={() => toggle(d.id)} />
              {d.products ? labelName(d.products, lang) : ''}
              {administeredHere(d) && <span className="text-gray-400">· ฉีดที่ร้าน</span>}
            </label>
          ))}
        </div>
      )}

      <div className="labels p-4 flex flex-wrap gap-4 print:p-0 print:gap-0">
        {toPrint.map((item) => {
          const sig = sigText({
            dose_amount: item.dose_amount,
            frequency: item.frequency,
            frequency_hours: item.frequency_hours,
            food_timing: item.food_timing,
            duration_days: item.duration_days,
            dose_times: item.dose_times,
            unit: item.products?.unit ?? '',
            note: item.dosage,
          }, lang)
          const indication = item.products ? labelIndication(item.products, lang) : null

          return (
            <div key={item.id} className="label bg-white border border-gray-300 shadow-sm print:shadow-none">
              <div className="flex items-baseline justify-between gap-2 border-b border-gray-300 pb-0.5">
                <span className="font-bold truncate" style={{ fontSize: '8.8pt' }}>{store?.name ?? 'LANDBARK'}</span>
                <span className="shrink-0 text-gray-600" style={{ fontSize: '7pt' }}>{store?.phone ?? ''}</span>
              </div>

              <div className="flex justify-between gap-2 text-gray-700 pt-0.5" style={{ fontSize: '7.2pt' }}>
                <span className="truncate">
                  {t.pet}: <b>{visit.pets?.name ?? '-'}</b>
                  {visit.pets?.hn && <span className="ml-1 text-gray-500">{visit.pets.hn}</span>}
                </span>
                <span className="truncate">{t.owner}: {visit.customers?.name ?? '-'}</span>
              </div>

              <div className="mt-1">
                <p className="font-bold clamp2" style={{ fontSize: '10pt' }}>
                  {item.products ? labelName(item.products, lang) : ''}
                </p>
                {item.products?.brand && (
                  <p className="text-gray-600 truncate" style={{ fontSize: '7.2pt' }}>
                    {item.products.brand}
                  </p>
                )}
              </div>

              <p className="mt-0.5 flex-1" style={{ fontSize: '9pt' }}>
                {sig || (lang === 'th' ? '— ยังไม่ได้ระบุวิธีใช้ —' : '— no directions —')}
              </p>

              {/* สรรพคุณเหลือบรรทัดเดียว (เดิม 2) — line-height 1.6 กินที่เพิ่ม ถ้ายังให้ 2 บรรทัด
                  วิธีใช้ยาจะเหลือไม่ถึงบรรทัด ซึ่งสำคัญกว่าสรรพคุณ */}
              {indication && (
                <p className="text-gray-600 italic clamp1 mb-0.5" style={{ fontSize: '7.2pt' }}>
                  {t.indication}: {indication}
                </p>
              )}

              <div className="flex justify-between gap-2 text-gray-600 border-t border-gray-300 pt-0.5" style={{ fontSize: '7pt' }}>
                <span>{t.qty}: {item.quantity} {item.products?.unit}</span>
                <span className="truncate">{t.vet}: {visit.vet?.name ?? '-'}</span>
                <span className="shrink-0">{fmtDate(visit.visit_date)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
