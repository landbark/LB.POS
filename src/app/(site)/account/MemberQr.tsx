'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ScanLine, X } from 'lucide-react'
import { memberCode } from '@/lib/member-code'

/**
 * บัตรสมาชิกของลูกค้า — ยื่นจอให้พนักงานยิงตอนจ่ายเงิน
 *
 * กดแล้วขยายเต็มจอพื้นขาว เพราะ QR บนพื้นเข้มหรือจอหรี่ๆ เครื่องยิงอ่านไม่ติด
 * (เว็บสั่งเพิ่มความสว่างจอเองไม่ได้ ต้องให้ลูกค้าเร่งเอง)
 */
export default function MemberQr({
  customerId,
  name,
  phone,
}: {
  customerId: string
  name: string
  phone: string | null
}) {
  const [full, setFull] = useState(false)
  const value = memberCode(customerId)

  return (
    <>
      <button
        type="button"
        onClick={() => setFull(true)}
        className="w-full flex items-center gap-4 rounded-xl bg-white border border-brand-muted/30 p-4 text-left hover:border-brand-brown transition-colors"
      >
        <span className="shrink-0 rounded-lg border border-brand-muted/30 bg-white p-1.5">
          <QRCodeSVG value={value} size={76} level="M" marginSize={0} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-brand-dark">บัตรสมาชิก</span>
          <span className="block text-xs text-gray-500 mt-0.5">
            ให้พนักงานสแกนตอนจ่ายเงิน แต้มเข้าให้เลย ไม่ต้องบอกเบอร์
          </span>
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-brown">
            <ScanLine size={13} /> แตะเพื่อขยายเต็มจอ
          </span>
        </span>
      </button>

      {full && (
        <div
          className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6"
          onClick={() => setFull(false)}
        >
          <button
            type="button"
            onClick={() => setFull(false)}
            aria-label="ปิด"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"
          >
            <X size={20} />
          </button>
          <QRCodeSVG value={value} size={260} level="M" marginSize={0} />
          <p className="mt-6 text-lg font-bold text-brand-dark">{name}</p>
          {phone && <p className="text-sm text-gray-500">{phone}</p>}
          <p className="mt-4 text-xs text-gray-400 text-center">
            ยื่นจอให้พนักงานยิง · อ่านไม่ติดให้เร่งความสว่างจอขึ้น
          </p>
        </div>
      )}
    </>
  )
}
