'use client'

import { QRCodeSVG } from 'qrcode.react'
import { memberCode } from '@/lib/member-code'

interface Store {
  name: string
  phone: string | null
}

interface Customer {
  id: string
  full_name: string
  hn: string | null
  phone: string
}

/**
 * บัตรสมาชิกที่พิมพ์ออกมาจับต้องได้ — ลูกค้าที่ไม่ได้ผูก LINE หรือไม่อยากเปิดเว็บทุกครั้งก็ยิงได้
 *
 * ใช้ได้ตลอดเพราะรหัสในบัตรเป็น id ลูกค้าที่ไม่เคยเปลี่ยน (ดู member-code.ts)
 * ไม่ต้องออกใบใหม่แม้ลูกค้าเปลี่ยนเบอร์ — แต่พิมพ์ชื่อ/เบอร์กำกับไว้ด้วย เผื่อ QR ลอกหลุด
 * พนักงานยังค้นจากบัตรได้
 *
 * ขนาด 80 × 50 มม. = ฉลากม้วนเดียวกับฉลากยา/ฉลากสัตว์ป่วย ไม่ต้องเปลี่ยนม้วนก่อนพิมพ์
 */
export default function MemberCardView({ customer, store }: { customer: Customer; store: Store | null }) {
  const value = memberCode(customer.id)

  return (
    <>
      <style>{`
        @page { size: 80mm 50mm; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .card { box-shadow: none !important; border: none !important; }
        }
        .card {
          width: 80mm; height: 50mm;
          padding: 3mm;
          box-sizing: border-box;
          display: flex; align-items: center; gap: 3mm;
          overflow: hidden;
        }
        /* Sarabun วรรณยุกต์พุ่งสูง ต่ำกว่า 1.62 แล้วหัวโดนตัดในกล่อง overflow:hidden — ดู print/label */
        .card, .card * { line-height: 1.62; }
        .row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .clamp2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <button onClick={() => window.close()} className="text-sm text-gray-500 hover:text-gray-700">
          ✕ ปิดหน้านี้
        </button>
        <span className="text-sm text-gray-400">ขนาด 80 × 50 มม. — ฉลากม้วนเดียวกับฉลากยา</span>
        <button
          onClick={() => window.print()}
          className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          พิมพ์
        </button>
      </div>

      <div className="p-4 print:p-0">
        <div className="card bg-white border border-gray-300 shadow-sm print:shadow-none">
          {/* QR 34 มม. — รหัสยาว 40 ตัวอักษรได้ราว 33 โมดูล ตกโมดูลละ ~1 มม. เครื่องยิงอ่านฉิว
              เว้นขอบขาวรอบตัว (marginSize 2) เพราะ QR ที่ชนขอบฉลากเครื่องยิงจับขอบไม่ได้ */}
          <div className="shrink-0" style={{ width: '34mm', height: '34mm' }}>
            <QRCodeSVG
              value={value}
              size={512}
              level="M"
              marginSize={2}
              style={{ width: '34mm', height: '34mm', display: 'block' }}
            />
          </div>

          <div className="min-w-0 flex-1">
            {/* ชื่อร้าน/ชื่อลูกค้ายาวเกินคอลัมน์ 37 มม. บ่อย — ให้ตกบรรทัดได้สองบรรทัด
                ดีกว่าโดน ... ตัดกลางชื่อ (ความสูงยังเหลือ การ์ดสูง 50 มม. ใช้จริงราว 30) */}
            <p className="clamp2 font-bold" style={{ fontSize: '7.5pt' }}>
              {store?.name ?? 'LANDBARK'}
            </p>
            <p className="row text-gray-500" style={{ fontSize: '7pt' }}>
              บัตรสมาชิก
            </p>

            <p className="clamp2 font-bold mt-1" style={{ fontSize: '11pt' }}>
              {customer.full_name}
            </p>
            {customer.hn && (
              <p className="row font-mono font-semibold text-gray-700" style={{ fontSize: '8.5pt' }}>
                HN {customer.hn}
              </p>
            )}
            <p className="row text-gray-600" style={{ fontSize: '8.5pt' }}>
              {customer.phone}
            </p>

            {/* บรรทัดนี้ยาวเกินคอลัมน์ 37 มม. ต้องปล่อยให้ตกบรรทัด — ใส่ .row (nowrap) แล้วโดนตัดครึ่งประโยค */}
            <p className="text-gray-500 mt-1 border-t border-gray-300 pt-0.5" style={{ fontSize: '6.5pt' }}>
              ยื่นให้พนักงานสแกนก่อนจ่ายเงิน · แต้มเข้าอัตโนมัติ
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
