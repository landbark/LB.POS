'use client'

import { useState } from 'react'
import PrintToolbar from '@/components/PrintToolbar'
import type { StoreSettings } from '@/lib/types'

interface PurchaseDoc {
  id: string
  purchase_number: string
  notes: string | null
  status: 'pending' | 'received'
  created_at: string
  suppliers: { name: string; contact_name: string | null; phone: string | null } | null
  purchase_items: {
    quantity: number
    unit_cost: number
    products: { name: string; sku: string | null; unit: string } | null
  }[]
}

type PaperSize = 'a4' | 'a5'

const PAPER_CONFIG: Record<PaperSize, { page: string; margin: string; width: string; font: string }> = {
  a4: { page: 'A4', margin: '15mm', width: '650px', font: '14px' },
  a5: { page: 'A5', margin: '10mm', width: '480px', font: '13px' },
}

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

export default function PurchasePrintView({ purchase, store }: { purchase: PurchaseDoc; store: StoreSettings | null }) {
  const [size, setSize] = useState<PaperSize>('a4')
  const cfg = PAPER_CONFIG[size]
  const total = purchase.purchase_items.reduce((sum, it) => sum + it.quantity * it.unit_cost, 0)

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
        backHref="/admin/receiving"
        size={size}
        onSizeChange={(v) => setSize(v as PaperSize)}
        sizes={[
          { value: 'a4', label: 'A4' },
          { value: 'a5', label: 'A5' },
        ]}
      />

      <div className="flex justify-center py-6 print:py-0">
        <div className="bg-white shadow-lg print:shadow-none p-8" style={{ width: cfg.width, fontSize: cfg.font, maxWidth: '100%' }}>
          {/* หัวร้าน */}
          <div className="flex items-start justify-between mb-6 gap-4">
            <div className="flex items-center gap-3">
              {store?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logo_url} alt={store.name} className="h-14 w-14 object-contain shrink-0" />
              )}
              <div>
                <p className="font-bold" style={{ fontSize: '1.2em' }}>{store?.name ?? 'LANDBARK'}</p>
                {store?.address && <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.85em' }}>{store.address}</p>}
                <p className="text-gray-600" style={{ fontSize: '0.85em' }}>
                  {[store?.phone && `โทร ${store.phone}`, store?.tax_id && `เลขผู้เสียภาษี ${store.tax_id}`].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold" style={{ fontSize: '1.3em' }}>ใบสั่งซื้อ</p>
              <p className="text-gray-500" style={{ fontSize: '0.85em' }}>Purchase Order</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6" style={{ fontSize: '0.9em' }}>
            <div>
              <p className="text-gray-500 mb-0.5">ผู้จำหน่าย</p>
              <p className="font-medium">{purchase.suppliers?.name ?? '—'}</p>
              {purchase.suppliers?.contact_name && <p className="text-gray-600">ติดต่อ {purchase.suppliers.contact_name}</p>}
              {purchase.suppliers?.phone && <p className="text-gray-600">โทร {purchase.suppliers.phone}</p>}
            </div>
            <div className="text-right">
              <p><span className="text-gray-500">เลขที่</span> <span className="font-mono">{purchase.purchase_number}</span></p>
              <p><span className="text-gray-500">วันที่</span> {new Date(purchase.created_at).toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
              {purchase.notes && <p><span className="text-gray-500">หมายเหตุ</span> {purchase.notes}</p>}
            </div>
          </div>

          <table className="w-full border-collapse mb-6" style={{ fontSize: '0.9em' }}>
            <thead>
              <tr className="border-b-2 border-gray-800 text-left">
                <th className="py-2 pr-2">สินค้า</th>
                <th className="py-2 pr-2 text-right w-20">จำนวน</th>
                <th className="py-2 pr-2 text-right w-24">ทุน/หน่วย</th>
                <th className="py-2 text-right w-28">รวม</th>
              </tr>
            </thead>
            <tbody>
              {purchase.purchase_items.map((it, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="py-2 pr-2">
                    {it.products?.name ?? 'สินค้า'}
                    {it.products?.sku && <span className="text-gray-400 font-mono"> ({it.products.sku})</span>}
                  </td>
                  <td className="py-2 pr-2 text-right">{it.quantity} {it.products?.unit ?? ''}</td>
                  <td className="py-2 pr-2 text-right">{money(it.unit_cost)}</td>
                  <td className="py-2 text-right">{money(it.quantity * it.unit_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mb-10">
            <div className="w-48 flex justify-between font-bold border-t-2 border-gray-800 pt-2" style={{ fontSize: '1.05em' }}>
              <span>รวมทั้งสิ้น</span>
              <span>฿{money(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-6" style={{ fontSize: '0.9em' }}>
            <div>
              <div className="border-b border-gray-400 h-10" />
              <p className="text-center text-gray-500 mt-1">ผู้สั่งซื้อ</p>
            </div>
            <div>
              <div className="border-b border-gray-400 h-10" />
              <p className="text-center text-gray-500 mt-1">ผู้รับสินค้า</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
