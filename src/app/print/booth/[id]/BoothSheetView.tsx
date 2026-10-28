'use client'

import { useState } from 'react'
import PrintToolbar from '@/components/PrintToolbar'
import type { BoothTrip, StoreSettings } from '@/lib/types'

export interface BoothSheetLine {
  name: string
  sku: string | null
  unit: string
  /** ราคาขายที่งาน (booth_price ไม่ได้ตั้งก็ราคาหน้าร้าน) — null = หาสินค้าไม่เจอ */
  price: number | null
  /** ราคางานต่างจากหน้าร้าน — ติดดาวไว้ให้คนขายรู้ */
  boothPriced: boolean
  taken: number
  returned: number | null
  sold: number
}

type PaperSize = 'a4' | 'a5'

const money = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 })

const PAPER_CONFIG: Record<PaperSize, { page: string; margin: string; width: string; font: string }> = {
  a4: { page: 'A4', margin: '15mm', width: '650px', font: '14px' },
  a5: { page: 'A5', margin: '10mm', width: '480px', font: '12px' },
}

export default function BoothSheetView({
  trip,
  store,
  lines,
}: {
  trip: BoothTrip
  store: StoreSettings | null
  lines: BoothSheetLine[]
}) {
  const [size, setSize] = useState<PaperSize>('a4')
  // ใบเบิก = เอาไปเท่าไร (ช่องคืนเว้นว่างให้เขียนมือ), ใบคืน = เอาไป/ขายได้/ควรเหลือ/คืน
  const [sheet, setSheet] = useState<'take' | 'return'>(trip.status === 'open' ? 'take' : 'return')
  const cfg = PAPER_CONFIG[size]

  const totalTaken = lines.reduce((s, l) => s + l.taken, 0)
  const totalSold = lines.reduce((s, l) => s + l.sold, 0)
  const totalReturned = lines.reduce((s, l) => s + (l.returned ?? 0), 0)
  // มูลค่าของที่ยกไป — ไว้เช็กคร่าวๆ ว่าของในรถเท่าไร
  const totalValue = lines.reduce((s, l) => s + (l.price ?? 0) * l.taken, 0)
  const hasBoothPriced = lines.some((l) => l.boothPriced)

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @page { size: ${cfg.page}; margin: ${cfg.margin}; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          /* ไม่งั้นเส้นตารางกับพื้นหัวตารางหายตอนพิมพ์ */
          * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
        .sheet th, .sheet td { line-height: 1.3; }
      `}</style>

      <PrintToolbar
        backHref={`/admin/booth/${trip.id}`}
        size={size}
        onSizeChange={(v) => setSize(v as PaperSize)}
        sizes={[
          { value: 'a4', label: 'A4' },
          { value: 'a5', label: 'A5' },
        ]}
      />

      <div className="no-print flex justify-center gap-2 bg-white border-b border-gray-200 px-4 py-2">
        <button
          onClick={() => setSheet('take')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 ${
            sheet === 'take' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600'
          }`}
        >
          ใบเบิก (ของที่ยกไป)
        </button>
        <button
          onClick={() => setSheet('return')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 ${
            sheet === 'return' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600'
          }`}
        >
          ใบคืน (ของที่ขนกลับ)
        </button>
      </div>

      <div className="flex justify-center py-6 print:py-0">
        <div className="bg-white shadow-lg print:shadow-none p-8 sheet" style={{ width: cfg.width, fontSize: cfg.font, maxWidth: '100%' }}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              {store?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logo_url} alt={store.name} className="h-14 w-14 object-contain shrink-0" />
              )}
              <div>
                <p className="font-bold" style={{ fontSize: '1.2em' }}>{store?.name ?? 'LANDBARK'}</p>
                {store?.phone && <p className="text-gray-600" style={{ fontSize: '0.85em' }}>โทร {store.phone}</p>}
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold" style={{ fontSize: '1.1em' }}>
                {sheet === 'take' ? 'ใบเบิกของไปออกบูธ' : 'ใบคืนของจากงานออกบูธ'}
              </p>
              <p className="text-gray-600" style={{ fontSize: '0.85em' }}>เลขที่ {trip.trip_number}</p>
            </div>
          </div>

          <div className="border border-gray-300 rounded p-3 mb-4" style={{ fontSize: '0.9em' }}>
            <p><span className="text-gray-500">งาน:</span> {trip.name || '—'}</p>
            <p><span className="text-gray-500">สถานที่:</span> {trip.location || '—'}</p>
            <p>
              <span className="text-gray-500">วันที่:</span>{' '}
              {new Date(trip.trip_date).toLocaleDateString('th-TH', { dateStyle: 'long' })}
            </p>
          </div>

          <table className="w-full border-collapse" style={{ fontSize: '0.9em' }}>
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1.5 text-left w-8">#</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">สินค้า</th>
                {sheet === 'take' && (
                  <th className="border border-gray-300 px-2 py-1.5 text-right w-20">ราคา</th>
                )}
                <th className="border border-gray-300 px-2 py-1.5 text-right w-16">เอาไป</th>
                {sheet === 'return' && (
                  <>
                    <th className="border border-gray-300 px-2 py-1.5 text-right w-16">ขายได้</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-right w-16">ควรเหลือ</th>
                  </>
                )}
                <th className="border border-gray-300 px-2 py-1.5 text-right w-16">คืน</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="border border-gray-300 px-2 py-1.5 text-gray-500">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1.5">
                    {l.name}
                    {l.sku && <span className="text-gray-400 ml-1" style={{ fontSize: '0.85em' }}>({l.sku})</span>}
                  </td>
                  {sheet === 'take' && (
                    <td className="border border-gray-300 px-2 py-1.5 text-right whitespace-nowrap">
                      {l.price == null ? '—' : `฿${money(l.price)}`}
                      {l.boothPriced && <span className="text-gray-500">*</span>}
                    </td>
                  )}
                  <td className="border border-gray-300 px-2 py-1.5 text-right">{l.taken} {l.unit}</td>
                  {sheet === 'return' && (
                    <>
                      <td className="border border-gray-300 px-2 py-1.5 text-right">{l.sold}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right font-medium">{l.taken - l.sold}</td>
                    </>
                  )}
                  {/* ช่องว่างไว้เขียนมือตอนนับของจริงที่หน้างาน */}
                  <td className="border border-gray-300 px-2 py-1.5 text-right">
                    {sheet === 'return' && l.returned != null ? l.returned : ''}
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={sheet === 'return' ? 6 : 5} className="border border-gray-300 px-2 py-6 text-center text-gray-400">
                    ยังไม่มีรายการในใบเบิก
                  </td>
                </tr>
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="border border-gray-300 px-2 py-1.5" colSpan={2}>รวม {lines.length} รายการ</td>
                  {sheet === 'take' && (
                    <td className="border border-gray-300 px-2 py-1.5 text-right whitespace-nowrap">
                      ฿{money(totalValue)}
                    </td>
                  )}
                  <td className="border border-gray-300 px-2 py-1.5 text-right">{totalTaken}</td>
                  {sheet === 'return' && (
                    <>
                      <td className="border border-gray-300 px-2 py-1.5 text-right">{totalSold}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right">{totalTaken - totalSold}</td>
                    </>
                  )}
                  <td className="border border-gray-300 px-2 py-1.5 text-right">
                    {sheet === 'return' ? totalReturned : ''}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>

          {sheet === 'take' && hasBoothPriced && (
            <p className="text-gray-500 mt-2" style={{ fontSize: '0.8em' }}>
              * ราคาเฉพาะงานออกบูธ (ไม่เท่าราคาหน้าร้าน)
            </p>
          )}

          <div className="flex justify-between gap-6 mt-10" style={{ fontSize: '0.85em' }}>
            <div className="flex-1 text-center">
              <div className="border-t border-gray-400 pt-1.5">
                ผู้เบิก / ผู้รับของไปงาน
              </div>
            </div>
            <div className="flex-1 text-center">
              <div className="border-t border-gray-400 pt-1.5">
                {sheet === 'take' ? 'ผู้จ่ายของ' : 'ผู้รับของคืน'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
