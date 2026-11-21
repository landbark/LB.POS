'use client'

import { useRef, useState } from 'react'
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react'
import { Download, ScanLine, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { memberCode } from '@/lib/member-code'

/**
 * บัตรสมาชิกของลูกค้า — ยื่นจอให้พนักงานยิงตอนจ่ายเงิน
 *
 * กดแล้วขยายเต็มจอพื้นขาว เพราะ QR บนพื้นเข้มหรือจอหรี่ๆ เครื่องยิงอ่านไม่ติด
 * (เว็บสั่งเพิ่มความสว่างจอเองไม่ได้ ต้องให้ลูกค้าเร่งเอง)
 *
 * ปุ่ม "บันทึกรูปบัตร" มีไว้ให้ไม่ต้องเข้าเว็บทุกครั้ง — รหัสในบัตรเป็น id ลูกค้า
 * ที่ไม่เคยเปลี่ยน (ดู member-code.ts) รูปที่บันทึกไว้จึงใช้ได้ตลอด เปิดจากคลังภาพ
 * ได้เลยแม้ไม่มีเน็ต และยิงจากรูปในคลังภาพได้เหมือนยิงจากหน้านี้
 */

// ขนาดรูปที่บันทึก — 820×1120 พอให้ QR กว้าง 620px คมชัดบนจอมือถือทุกรุ่น
// (เล็กกว่านี้ตอนลูกค้าซูมดูในคลังภาพแล้วขอบโมดูลเริ่มเบลอ เครื่องยิงอ่านช้าลง)
const IMG_W = 820
const IMG_H = 1120
const QR_SIZE = 620

/** ย่อฟอนต์ลงทีละสเต็ปจนชื่อยาวๆ ไม่ล้นขอบรูป */
function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, weight: number, size: number, family: string) {
  let px = size
  do {
    ctx.font = `${weight} ${px}px ${family}`
    if (ctx.measureText(text).width <= maxWidth) return
    px -= 2
  } while (px > 20)
}

/**
 * dataURL → Blob แบบซิงโครนัส (ไม่ใช่ canvas.toBlob ที่เป็น callback)
 *
 * Safari ยอมให้เรียก navigator.share() เฉพาะในจังหวะที่ยังนับเป็น user gesture อยู่ —
 * ถ้ารอ callback หรือ await อะไรก่อน gesture จะหมดอายุแล้วโดน NotAllowedError
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const mime = head.match(/:(.*?);/)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export default function MemberQr({
  customerId,
  name,
  phone,
  storeName,
}: {
  customerId: string
  name: string
  phone: string | null
  storeName: string
}) {
  const [full, setFull] = useState(false)
  const qrRef = useRef<HTMLCanvasElement>(null)
  const value = memberCode(customerId)

  /** วาดบัตรลงแคนวาสใหม่ — QR เปล่าๆ ไม่มีชื่อกำกับ เปิดดูในคลังภาพทีหลังแล้วไม่รู้ว่ารูปอะไร */
  function buildCardImage(): string | null {
    const qr = qrRef.current
    if (!qr) return null

    const canvas = document.createElement('canvas')
    canvas.width = IMG_W
    canvas.height = IMG_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // ฟอนต์ของ next/font ชื่อถูกสุ่มตอน build (เช่น __Sarabun_abc123) อ่านจาก CSS variable เท่านั้น
    const sarabun = getComputedStyle(document.documentElement).getPropertyValue('--font-sarabun').trim()
    const family = `${sarabun ? `${sarabun}, ` : ''}sans-serif`

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, IMG_W, IMG_H)
    ctx.textAlign = 'center'

    // แถบหัวสีแบรนด์ — ช่วยให้หารูปในคลังภาพเจอเร็วตอนเลื่อนผ่านรูปเป็นร้อย
    ctx.fillStyle = '#4A4338'
    ctx.fillRect(0, 0, IMG_W, 170)
    ctx.fillStyle = '#D4A87A'
    fitFont(ctx, storeName, IMG_W - 80, 500, 32, family)
    ctx.fillText(storeName, IMG_W / 2, 64)
    ctx.fillStyle = '#F0E8DC'
    ctx.font = `700 52px ${family}`
    ctx.fillText('บัตรสมาชิก', IMG_W / 2, 132)

    // QR วางบนพื้นขาวล้วน เหลือขอบว่างรอบตัวเกินสี่โมดูล (quiet zone) ให้เครื่องยิงจับขอบได้
    ctx.drawImage(qr, (IMG_W - QR_SIZE) / 2, 250, QR_SIZE, QR_SIZE)

    ctx.fillStyle = '#7A4E2D'
    fitFont(ctx, name, IMG_W - 80, 700, 46, family)
    ctx.fillText(name, IMG_W / 2, 975)

    if (phone) {
      ctx.fillStyle = '#6b7280'
      ctx.font = `400 32px ${family}`
      ctx.fillText(phone, IMG_W / 2, 1025)
    }

    ctx.fillStyle = '#9ca3af'
    ctx.font = `400 28px ${family}`
    ctx.fillText('ยื่นให้พนักงานสแกนตอนจ่ายเงิน', IMG_W / 2, 1080)

    return canvas.toDataURL('image/png')
  }

  function saveCard() {
    const dataUrl = buildCardImage()
    if (!dataUrl) {
      toast.error('สร้างรูปบัตรไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }
    const blob = dataUrlToBlob(dataUrl)
    const file = new File([blob], 'landbark-member-card.png', { type: 'image/png' })

    // มือถือ: ผ่านแผงแชร์ของเครื่อง → "บันทึกรูปภาพ" ลงคลังภาพได้เลย
    // (บน iOS การกด <a download> ได้แค่เปิดรูปในแท็บใหม่ ลูกค้าต้องกดเซฟเองอีกต่อ)
    if (navigator.canShare?.({ files: [file] })) {
      // ปิดแผงแชร์ทิ้ง = AbortError ไม่ใช่ความผิดพลาด ไม่ต้องเด้งเตือน
      navigator.share({ files: [file], title: 'บัตรสมาชิก' }).catch(() => {})
      return
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'landbark-member-card.png'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('บันทึกรูปบัตรแล้ว')
  }

  return (
    <>
      {/* ต้นฉบับของรูปที่บันทึก — ซ่อนไว้แต่ยังวาดจริง (canvas ที่ display:none ยังอ่านภาพออกได้) */}
      <QRCodeCanvas ref={qrRef} value={value} size={QR_SIZE} level="M" marginSize={0} className="hidden" />

      <div className="rounded-xl bg-white border border-brand-muted/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setFull(true)}
          className="w-full flex items-center gap-4 p-4 text-left hover:bg-brand-light/60 transition-colors"
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

        {/* บันทึกรูปไว้ครั้งเดียวใช้ได้ตลอด — รหัสในบัตรไม่เคยเปลี่ยน แม้เปลี่ยนเบอร์ */}
        <button
          type="button"
          onClick={saveCard}
          className="w-full flex items-center justify-center gap-2 border-t border-brand-muted/30 px-4 py-3 text-sm font-medium text-brand-dark hover:bg-brand-light/60 transition-colors"
        >
          <Download size={15} /> บันทึกรูปบัตรลงเครื่อง
        </button>
      </div>

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
          {/* อยู่ในชั้นที่กดตรงไหนก็ปิด — ปุ่มนี้ต้องกันคลิกไม่ให้ทะลุไปสั่งปิดจอ */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); saveCard() }}
            className="mt-8 inline-flex items-center gap-2 rounded-xl border border-brand-muted/50 px-4 py-2.5 text-sm font-medium text-brand-dark"
          >
            <Download size={15} /> บันทึกรูปบัตรลงเครื่อง
          </button>
        </div>
      )}
    </>
  )
}
