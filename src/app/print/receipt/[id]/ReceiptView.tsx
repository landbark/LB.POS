'use client'

import { useEffect, useState } from 'react'
import PrintToolbar from '@/components/PrintToolbar'
import type { StoreSettings, PaymentMethod } from '@/lib/types'

interface ReceiptTx {
  id: string
  transaction_number: string
  created_at: string
  subtotal: number
  discount: number
  total: number
  status: 'completed' | 'cancelled'
  payment_method: PaymentMethod
  cash_received: number | null
  change_given: number | null
  points_earned: number
  points_used: number
  credit_used: number
  customers: { name: string; phone: string } | null
  profiles: { name: string } | null
  transaction_items: {
    quantity: number
    unit_price: number
    discount: number
    subtotal: number
    products: { name: string; unit: string } | null
  }[]
}

type PaperSize = '80mm' | 'a4' | 'a5'

const PAPER_CONFIG: Record<PaperSize, { page: string; margin: string; width: string; font: string }> = {
  '80mm': { page: '80mm auto', margin: '2mm 3mm', width: '300px', font: '12px' },
  a4: { page: 'A4', margin: '15mm', width: '620px', font: '14px' },
  a5: { page: 'A5', margin: '10mm', width: '460px', font: '13px' },
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  card: 'บัตรเครดิต',
  qr: 'QR Code',
}

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

export default function ReceiptView({
  tx,
  store,
  backHref,
  isCustomer = false,
}: {
  tx: ReceiptTx
  store: StoreSettings | null
  backHref: string
  isCustomer?: boolean
}) {
  const [size, setSize] = useState<PaperSize>('80mm')
  const cfg = PAPER_CONFIG[size]

  // ลูกค้า (จากหน้าเช็คแต้ม LINE) ไม่ต้องเลือกขนาด — บังคับ 80mm แล้วเด้งไดอะล็อกบันทึกเป็น PDF ให้เลย
  // อยากได้แบบเต็ม (A4/A5) ให้ไปขอพนักงานพิมพ์จาก /pos หรือ /admin/documents แทน
  useEffect(() => {
    if (isCustomer) window.print()
  }, [isCustomer])

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
        backHref={backHref}
        size={size}
        onSizeChange={(v) => setSize(v as PaperSize)}
        sizes={
          isCustomer
            ? []
            : [
                { value: '80mm', label: '80mm (เครื่องพิมพ์ใบเสร็จ)' },
                { value: 'a4', label: 'A4' },
                { value: 'a5', label: 'A5' },
              ]
        }
      />

      <div className="flex justify-center py-6 print:py-0">
        <div
          className="bg-white shadow-lg print:shadow-none p-4"
          style={{ width: cfg.width, fontSize: cfg.font, maxWidth: '100%' }}
        >
          {tx.status === 'cancelled' && (
            <p className="text-center font-bold text-red-600 border-2 border-red-500 rounded py-1 mb-3" style={{ fontSize: '1.1em' }}>
              ใบเสร็จนี้ถูกยกเลิกแล้ว
            </p>
          )}

          {/* หัวร้าน */}
          <div className="text-center mb-3">
            {store?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt={store.name} className="mx-auto mb-1 h-14 w-14 object-contain" />
            )}
            <p className="font-bold" style={{ fontSize: '1.15em' }}>{store?.name ?? 'LANDBARK'}</p>
            {store?.address && <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.85em' }}>{store.address}</p>}
            {store?.phone && <p className="text-gray-600" style={{ fontSize: '0.85em' }}>โทร {store.phone}</p>}
            {store?.tax_id && <p className="text-gray-600" style={{ fontSize: '0.85em' }}>เลขผู้เสียภาษี {store.tax_id}</p>}
          </div>

          <div className="border-t border-dashed border-gray-400 my-2" />

          <p className="font-semibold text-center mb-2">ใบเสร็จรับเงิน</p>
          <div className="space-y-0.5 mb-2" style={{ fontSize: '0.9em' }}>
            <div className="flex justify-between"><span>เลขที่</span><span className="font-mono">{tx.transaction_number}</span></div>
            <div className="flex justify-between">
              <span>วันที่</span>
              <span>{new Date(tx.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            {tx.profiles?.name && <div className="flex justify-between"><span>พนักงาน</span><span>{tx.profiles.name}</span></div>}
            {tx.customers && <div className="flex justify-between"><span>ลูกค้า</span><span>{tx.customers.name}</span></div>}
          </div>

          <div className="border-t border-dashed border-gray-400 my-2" />

          {/* รายการสินค้า */}
          <div className="space-y-1.5 mb-2">
            {tx.transaction_items.map((item, i) => (
              <div key={i}>
                <div className="flex justify-between font-medium">
                  <span>{item.products?.name ?? 'สินค้า'}</span>
                  <span>{money(item.subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-500" style={{ fontSize: '0.85em' }}>
                  <span>{item.quantity} {item.products?.unit ?? ''} x {money(item.unit_price)}</span>
                  {item.discount > 0 && <span>ลด {money(item.discount)}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-gray-400 my-2" />

          {/* สรุปยอด */}
          <div className="space-y-0.5" style={{ fontSize: '0.9em' }}>
            <div className="flex justify-between"><span>ยอดรวม</span><span>{money(tx.subtotal)}</span></div>
            {tx.discount > 0 && <div className="flex justify-between"><span>ส่วนลด</span><span>-{money(tx.discount)}</span></div>}
            {tx.credit_used > 0 && <div className="flex justify-between"><span>ใช้เครดิต</span><span>-{money(tx.credit_used)}</span></div>}
            <div className="flex justify-between font-bold border-t border-gray-300 pt-1 mt-1" style={{ fontSize: '1.05em' }}>
              <span>ยอดสุทธิ</span><span>{money(tx.total)}</span>
            </div>
            <div className="flex justify-between pt-1"><span>ชำระโดย</span><span>{PAYMENT_LABELS[tx.payment_method]}</span></div>
            {tx.payment_method === 'cash' && tx.cash_received != null && (
              <>
                <div className="flex justify-between"><span>รับเงิน</span><span>{money(tx.cash_received)}</span></div>
                <div className="flex justify-between"><span>เงินทอน</span><span>{money(tx.change_given ?? 0)}</span></div>
              </>
            )}
            {(tx.points_earned > 0 || tx.points_used > 0) && (
              <div className="flex justify-between text-gray-500 pt-1" style={{ fontSize: '0.85em' }}>
                <span>แต้มสะสม</span>
                <span>
                  {tx.points_used > 0 && `ใช้ ${tx.points_used} `}
                  {tx.points_earned > 0 && `ได้รับ ${tx.points_earned}`}
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-gray-400 my-2" />
          <p className="text-center text-gray-500" style={{ fontSize: '0.85em' }}>ขอบคุณที่ใช้บริการค่ะ</p>
        </div>
      </div>
    </div>
  )
}
