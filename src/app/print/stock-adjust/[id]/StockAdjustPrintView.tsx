'use client'

import { useState } from 'react'
import PrintToolbar from '@/components/PrintToolbar'
import type { StoreSettings } from '@/lib/types'
import { MOVEMENT_LABEL, type AdjustDoc } from '@/lib/stockMovements'

type PaperSize = 'a4' | 'a5'

const PAPER_CONFIG: Record<PaperSize, { page: string; margin: string; width: string; font: string }> = {
  a4: { page: 'A4', margin: '15mm', width: '650px', font: '14px' },
  a5: { page: 'A5', margin: '10mm', width: '480px', font: '13px' },
}

export default function StockAdjustPrintView({ doc, store }: { doc: AdjustDoc; store: StoreSettings | null }) {
  const [size, setSize] = useState<PaperSize>('a5')
  const cfg = PAPER_CONFIG[size]
  const label = MOVEMENT_LABEL[doc.type]
  const title = doc.isWriteoff ? 'ใบตัดสต็อกออก' : label.sign === '+' ? 'ใบปรับสต็อกเพิ่ม' : 'ใบปรับสต็อกลด'

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @page { size: ${cfg.page}; margin: ${cfg.margin}; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <PrintToolbar
        fileName={`LB_ADJ_${doc.id.slice(0, 6).toUpperCase()}`}
        backHref="/admin/documents?tab=stock"
        size={size}
        onSizeChange={(v) => setSize(v as PaperSize)}
        sizes={[
          { value: 'a4', label: 'A4' },
          { value: 'a5', label: 'A5' },
        ]}
      />

      <div className="flex justify-center py-6 print:py-0">
        <div className="bg-white shadow-lg print:shadow-none p-8" style={{ width: cfg.width, fontSize: cfg.font, maxWidth: '100%' }}>
          <div className="flex items-start justify-between mb-6 gap-4">
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
              <p className="font-bold" style={{ fontSize: '1.3em' }}>{title}</p>
              <p className="text-gray-500" style={{ fontSize: '0.85em' }}>Stock Adjustment</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6" style={{ fontSize: '0.9em' }}>
            <div>
              <p className="text-gray-500 mb-0.5">เหตุผล</p>
              <p className="font-medium whitespace-pre-line">{doc.note}</p>
            </div>
            <div className="text-right">
              <p>
                <span className="text-gray-500">อ้างอิง</span>{' '}
                <span className="font-mono">ADJ-{doc.id.slice(0, 6).toUpperCase()}</span>
              </p>
              <p>
                <span className="text-gray-500">วันที่</span>{' '}
                {new Date(doc.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' })}
              </p>
              <p><span className="text-gray-500">ผู้ทำรายการ</span> {doc.byName}</p>
            </div>
          </div>

          <table className="w-full border-collapse mb-6" style={{ fontSize: '0.9em' }}>
            <thead>
              <tr className="border-b-2 border-gray-800 text-left">
                <th className="py-2 pr-2 w-8">#</th>
                <th className="py-2 pr-2">สินค้า</th>
                <th className="py-2 text-right w-28">จำนวน</th>
              </tr>
            </thead>
            <tbody>
              {doc.rows.map((r, i) => (
                <tr key={r.id} className="border-b border-gray-200">
                  <td className="py-2 pr-2 text-gray-500">{i + 1}</td>
                  <td className="py-2 pr-2">
                    {r.products?.name ?? 'สินค้า'}
                    {r.products?.sku && <span className="text-gray-400 font-mono"> ({r.products.sku})</span>}
                  </td>
                  <td className="py-2 text-right">
                    {label.sign}{r.quantity.toLocaleString('th-TH')} {r.products?.unit ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mb-10">
            <div className="w-56 flex justify-between font-bold border-t-2 border-gray-800 pt-2" style={{ fontSize: '1.05em' }}>
              <span>รวม {doc.rows.length} รายการ</span>
              <span>{label.sign}{doc.totalQty.toLocaleString('th-TH')}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-6" style={{ fontSize: '0.9em' }}>
            <div>
              <div className="border-b border-gray-400 h-10" />
              <p className="text-center text-gray-500 mt-1">ผู้ทำรายการ</p>
            </div>
            <div>
              <div className="border-b border-gray-400 h-10" />
              <p className="text-center text-gray-500 mt-1">ผู้อนุมัติ</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
