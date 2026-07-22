'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { downloadCsv } from '@/lib/csv'
import type { StoreSettings } from '@/lib/types'

// เกณฑ์จดทะเบียน VAT ตามกฎหมาย: รายรับจากสินค้า/บริการที่อยู่ในบังคับ VAT เกิน 1.8 ล้านบาทต่อปี
const VAT_THRESHOLD = 1_800_000

interface MonthRow {
  month: number
  vat_sales: number
  non_vat_sales: number
  bill_count: number
}

const MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function VatReportClient({
  year,
  currentYear,
  months,
  store,
  loadError,
}: {
  year: number
  currentYear: number
  months: MonthRow[]
  store: StoreSettings | null
  loadError: string | null
}) {
  const router = useRouter()

  const byMonth = new Map(months.map((m) => [Number(m.month), m]))
  const rows = Array.from({ length: 12 }, (_, i) => {
    const m = byMonth.get(i + 1)
    return {
      month: i + 1,
      vat: Number(m?.vat_sales ?? 0),
      nonVat: Number(m?.non_vat_sales ?? 0),
      bills: Number(m?.bill_count ?? 0),
    }
  })

  const vatTotal = rows.reduce((s, r) => s + r.vat, 0)
  const nonVatTotal = rows.reduce((s, r) => s + r.nonVat, 0)
  const percent = (vatTotal / VAT_THRESHOLD) * 100
  const remaining = VAT_THRESHOLD - vatTotal

  const status = vatTotal >= VAT_THRESHOLD
    ? { tone: 'red', label: 'เกินเกณฑ์แล้ว', note: 'ต้องยื่นจดทะเบียน VAT กับสรรพากรภายใน 30 วันนับจากวันที่ยอดเกิน' }
    : percent >= 80
      ? { tone: 'amber', label: 'ใกล้ถึงเกณฑ์', note: `เหลืออีก ฿${money(remaining)} จะถึงเกณฑ์ — ควรเตรียมเรื่องจดทะเบียนไว้ล่วงหน้า` }
      : { tone: 'green', label: 'ยังไม่ถึงเกณฑ์', note: `ต่ำกว่าเกณฑ์อยู่ ฿${money(remaining)}` }

  const toneClass = {
    red: { box: 'bg-red-50 border-red-200', text: 'text-red-700', bar: 'bg-red-500' },
    amber: { box: 'bg-amber-50 border-amber-200', text: 'text-amber-700', bar: 'bg-amber-500' },
    green: { box: 'bg-green-50 border-green-200', text: 'text-green-700', bar: 'bg-green-500' },
  }[status.tone as 'red' | 'amber' | 'green']

  function exportCsv() {
    downloadCsv(
      [
        [`รายงานยอดขายแยก VAT ปี ${year} — ${store?.name ?? 'LANDBARK'}`],
        ['เดือน', 'ยอดขายกลุ่มมี VAT', 'ยอดขายกลุ่มไม่มี VAT', 'รวม', 'จำนวนบิล'],
        ...rows.map((r) => [
          MONTH_TH[r.month - 1],
          r.vat.toFixed(2),
          r.nonVat.toFixed(2),
          (r.vat + r.nonVat).toFixed(2),
          String(r.bills),
        ]),
        ['รวมทั้งปี', vatTotal.toFixed(2), nonVatTotal.toFixed(2), (vatTotal + nonVatTotal).toFixed(2), String(rows.reduce((s, r) => s + r.bills, 0))],
        [],
        ['เกณฑ์จดทะเบียน VAT', VAT_THRESHOLD.toFixed(2)],
        ['สถานะ', status.label],
      ],
      `landbark-vat-${year}.csv`,
    )
  }

  return (
    <div>
      <style>{`
        @page { size: A4; margin: 15mm; }
        @media print {
          .no-print { display: none !important; }
          .print-plain { box-shadow: none !important; border-color: #ddd !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/admin/reports" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">ยอดขายแยก VAT รายปี</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => router.push(`/admin/reports/vat?year=${e.target.value}`)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>ปี {y + 543} ({y})</option>
            ))}
          </select>
          <button onClick={exportCsv} className="flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg">
            <Download size={15} /> CSV
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            <Printer size={15} /> พิมพ์
          </button>
        </div>
      </div>

      {loadError && (
        <div className="no-print bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">
          ดึงข้อมูลไม่สำเร็จ: {loadError}
          <br />
          ถ้าขึ้นว่าไม่พบฟังก์ชัน แปลว่ายังไม่ได้รัน <span className="font-mono">supabase-migration-vat-report.sql</span> ใน SQL Editor
        </div>
      )}

      {/* หัวกระดาษ — โชว์เฉพาะตอนพิมพ์ ให้เอกสารมีชื่อร้าน/เลขผู้เสียภาษี */}
      <div className="hidden print:block mb-6">
        <p className="font-bold text-lg">{store?.name ?? 'LANDBARK'}</p>
        {store?.address && <p className="text-sm text-gray-600 whitespace-pre-line">{store.address}</p>}
        <p className="text-sm text-gray-600">
          {[store?.phone && `โทร ${store.phone}`, store?.tax_id && `เลขผู้เสียภาษี ${store.tax_id}`].filter(Boolean).join(' · ')}
        </p>
        <p className="font-semibold mt-3">รายงานยอดขายแยกกลุ่ม VAT ปี {year + 543} ({year})</p>
      </div>

      <div className={`print-plain rounded-xl border p-5 mb-6 ${toneClass.box}`}>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-gray-600">ยอดขายสินค้าที่อยู่ในบังคับ VAT ปี {year + 543}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">฿{money(vatTotal)}</p>
          </div>
          <div className="text-right">
            <p className={`font-semibold ${toneClass.text}`}>{status.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">เกณฑ์จดทะเบียน ฿{money(VAT_THRESHOLD)}</p>
          </div>
        </div>

        <div className="mt-3 h-2.5 w-full bg-white rounded-full overflow-hidden border border-gray-200">
          <div className={`h-full ${toneClass.bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
        <p className={`text-sm mt-2 ${toneClass.text}`}>
          {percent.toFixed(1)}% ของเกณฑ์ · {status.note}
        </p>
      </div>

      <div className="print-plain bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เดือน</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">กลุ่มมี VAT</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">กลุ่มไม่มี VAT</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">รวม</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">บิล</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => (
              <tr key={r.month} className={r.bills === 0 ? 'text-gray-300' : ''}>
                <td className="px-4 py-2.5 text-sm">{MONTH_TH[r.month - 1]}</td>
                <td className="px-4 py-2.5 text-sm text-right font-medium">{money(r.vat)}</td>
                <td className="px-4 py-2.5 text-sm text-right">{money(r.nonVat)}</td>
                <td className="px-4 py-2.5 text-sm text-right">{money(r.vat + r.nonVat)}</td>
                <td className="px-4 py-2.5 text-sm text-right">{r.bills}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-bold text-gray-900">
              <td className="px-4 py-3 text-sm">รวมทั้งปี</td>
              <td className="px-4 py-3 text-sm text-right">{money(vatTotal)}</td>
              <td className="px-4 py-3 text-sm text-right">{money(nonVatTotal)}</td>
              <td className="px-4 py-3 text-sm text-right">{money(vatTotal + nonVatTotal)}</td>
              <td className="px-4 py-3 text-sm text-right">{rows.reduce((s, r) => s + r.bills, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        ยอดคิดจากราคาที่เก็บได้จริงต่อบิล (หักส่วนลด/แต้ม/เครดิตแล้ว) เฉลี่ยตามสัดส่วนราคาสินค้าในบิลนั้น
        ไม่รวมบิลที่ถูกยกเลิก · จัดกลุ่ม VAT ตามที่ตั้งไว้ ณ วันที่ขาย
      </p>
    </div>
  )
}
