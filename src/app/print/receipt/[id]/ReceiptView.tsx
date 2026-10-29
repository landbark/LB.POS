'use client'

import { useEffect, useState } from 'react'
import PrintToolbar from '@/components/PrintToolbar'
import type { StoreSettings } from '@/lib/types'
import ReceiptSlip from './ReceiptSlip'
import ReceiptDocument from './ReceiptDocument'
import { PAPER_CONFIG, type PaperSize, type ReceiptTx } from './receipt-shared'

// เปลือกหน้าพิมพ์ใบเสร็จ — คุมขนาดกระดาษกับแถบเครื่องมือ ส่วนเนื้อใบเสร็จมีสองแบบ
// 80mm = สลิปความร้อนหน้าเคาน์เตอร์, A4/A5 = เอกสารเต็มรูปแบบไว้ส่งลูกค้า/เก็บแฟ้ม
export default function ReceiptView({
  tx,
  store,
  backHref,
  isCustomer = false,
  isEmbed = false,
}: {
  tx: ReceiptTx
  store: StoreSettings | null
  backHref: string
  isCustomer?: boolean
  /** โหลดอยู่ใน iframe ซ่อนของหน้าขาย — ตัดแถบเครื่องมือกับพื้นหลังหน้าเว็บออก เหลือแต่ตัวใบเสร็จ */
  isEmbed?: boolean
}) {
  const [size, setSize] = useState<PaperSize>('80mm')
  const cfg = PAPER_CONFIG[size]
  const isSlip = size === '80mm'

  // ลูกค้า (จากหน้าเช็คแต้ม LINE) ไม่ต้องเลือกขนาด — บังคับ 80mm แล้วเด้งไดอะล็อกบันทึกเป็น PDF ให้เลย
  // อยากได้แบบเต็ม (A4/A5) ให้ไปขอพนักงานพิมพ์จาก /pos หรือ /admin/documents แทน
  useEffect(() => {
    if (isCustomer) window.print()
  }, [isCustomer])

  return (
    <div className={isEmbed ? 'bg-white' : 'min-h-screen bg-gray-100 print:bg-white'}>
      <style>{`
        @page { size: ${cfg.page}; margin: ${cfg.margin}; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      {!isEmbed && (
        <PrintToolbar
          backHref={backHref}
          // ลูกค้าเปิดจากหน้าเช็คแต้มในแท็บเดิม — ให้ปุ่มพากลับ ไม่ใช่ปิดแท็บ
          variant={isCustomer ? 'back' : 'close'}
          size={size}
          onSizeChange={(v) => setSize(v as PaperSize)}
          sizes={
            isCustomer
              ? []
              : [
                  { value: '80mm', label: '80mm (เครื่องพิมพ์ใบเสร็จ)' },
                  { value: 'a5', label: 'A5 (เต็มรูปแบบ)' },
                  { value: 'a4', label: 'A4 (เต็มรูปแบบ)' },
                ]
          }
        />
      )}

      <div className={isEmbed ? '' : 'flex justify-center py-6 print:py-0'}>
        <div
          className={`bg-white ${cfg.pad}${isEmbed ? '' : ' shadow-lg print:shadow-none'}`}
          style={{ width: cfg.width, fontSize: cfg.font, maxWidth: '100%' }}
        >
          {isSlip ? <ReceiptSlip tx={tx} store={store} /> : <ReceiptDocument tx={tx} store={store} />}
        </div>
      </div>
    </div>
  )
}
