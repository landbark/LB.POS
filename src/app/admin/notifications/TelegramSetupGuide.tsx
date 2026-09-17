'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Smartphone, UserPlus, QrCode, MessageSquare, ShieldCheck, PartyPopper,
  ChevronDown, ChevronUp, ExternalLink, Copy, Check, Printer,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Step {
  icon: typeof Smartphone
  title: string
  body: React.ReactNode
}

export default function TelegramSetupGuide({
  botUsername,
  botLink,
  hasApproved,
}: {
  botUsername: string
  botLink: string
  hasApproved: boolean
}) {
  // ยังไม่มีใครเชื่อมสำเร็จ = กางคู่มือไว้เลย เชื่อมแล้วค่อยพับเก็บ
  const [open, setOpen] = useState(!hasApproved)
  const [copied, setCopied] = useState(false)

  const handle = botUsername ? `@${botUsername.replace(/^@/, '')}` : ''

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(botLink)
      setCopied(true)
      toast.success('คัดลอกลิงก์แล้ว — ส่งให้เจ้าของทางแชทได้เลย')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('คัดลอกไม่สำเร็จ')
    }
  }

  if (!botUsername) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6 max-w-xl">
        <h2 className="font-semibold text-amber-900 mb-1">ยังตั้งค่าบอทไม่เสร็จ</h2>
        <p className="text-sm text-amber-800">
          ผู้ดูแลระบบต้องตั้งค่า <span className="font-mono bg-amber-100 px-1 rounded">TELEGRAM_BOT_TOKEN</span> และ{' '}
          <span className="font-mono bg-amber-100 px-1 rounded">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</span> บน Vercel ก่อน
          แล้วคู่มือเชื่อมต่อสำหรับเจ้าของร้านจะขึ้นตรงนี้
        </p>
      </div>
    )
  }

  const steps: Step[] = [
    {
      icon: Smartphone,
      title: 'ลงแอป Telegram ในมือถือ',
      body: (
        <>
          <p>เปิด App Store (iPhone) หรือ Play Store (Android) พิมพ์ค้นหาคำว่า <b>Telegram</b> แล้วกดติดตั้ง</p>
          <p className="text-gray-500 mt-1">ไอคอนเป็นรูปเครื่องบินกระดาษสีขาวบนพื้นฟ้า · แอปฟรี ไม่มีค่าใช้จ่าย</p>
        </>
      ),
    },
    {
      icon: UserPlus,
      title: 'สมัครด้วยเบอร์มือถือ',
      body: (
        <>
          <p>เปิดแอป → กด <b>Start Messaging</b> → เลือกประเทศ <b>Thailand</b> → ใส่เบอร์มือถือ</p>
          <p className="mt-1">จะมีรหัสส่งมาทาง SMS ให้กรอกรหัสนั้น แล้วใส่ชื่อของตัวเอง เป็นอันเสร็จ</p>
          <p className="text-gray-500 mt-1">ใช้เบอร์เดิมที่ใช้อยู่ได้เลย ไม่ต้องซื้อเบอร์ใหม่</p>
        </>
      ),
    },
    {
      icon: QrCode,
      title: 'เปิดบอทของร้าน',
      body: (
        <>
          <p>
            ในแอป Telegram กดรูป <b>กล้อง/สแกน</b> ที่ช่องค้นหาด้านบน แล้วส่องกล้องมาที่ QR นี้
          </p>
          <p className="mt-1">
            หรือพิมพ์ชื่อบอท <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{handle}</span> ในช่องค้นหาก็ได้
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <QRCodeSVG value={botLink} size={132} level="M" />
            </div>
            <div className="text-xs text-gray-500 max-w-[13rem]">
              ถ้าเจ้าของอ่านหน้านี้จากมือถือเครื่องเดียวกัน กดปุ่ม
              <b> เปิดบอท Telegram </b>ด้านล่างได้เลย ไม่ต้องสแกน
            </div>
          </div>
        </>
      ),
    },
    {
      icon: MessageSquare,
      title: 'กดปุ่ม START',
      body: (
        <>
          <p>พอเปิดบอทได้จะเห็นปุ่ม <b>START</b> (หรือ เริ่ม) สีฟ้าที่ก้นหน้าจอ — กดหนึ่งครั้ง</p>
          <p className="mt-1">
            ถ้าไม่เห็นปุ่ม ให้พิมพ์ <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">/start</span> ส่งเข้าไปแทน
          </p>
          <p className="text-gray-500 mt-1">บอทจะตอบกลับว่า &ldquo;ส่งคำขอรับแจ้งเตือนแล้ว — รอแอดมินอนุมัติ&rdquo;</p>
        </>
      ),
    },
    {
      icon: ShieldCheck,
      title: 'ให้แอดมินกดอนุมัติ',
      body: (
        <>
          <p>
            ชื่อที่เพิ่งกด START จะโผล่ในกล่อง <b>รออนุมัติ</b> ของหน้านี้ — กด <b>อนุมัติ</b> หนึ่งครั้ง
          </p>
          <p className="text-gray-500 mt-1">
            ขั้นนี้มีไว้กันคนนอกแอบสมัครรับข้อมูลร้าน อนุมัติเฉพาะคนที่รู้จักเท่านั้น
          </p>
          <p className="text-gray-400 mt-1">(ถ้ายังไม่ขึ้น กดปุ่ม รีเฟรชรายชื่อ ด้านล่าง)</p>
        </>
      ),
    },
    {
      icon: PartyPopper,
      title: 'เสร็จแล้ว — ลองทดสอบ',
      body: (
        <>
          <p>บอทจะทักไปว่าได้รับอนุมัติแล้ว จากนี้แจ้งเตือนจะเด้งเข้ามือถือเองทุกครั้งที่มีเหตุการณ์</p>
          <p className="mt-1">กดปุ่ม <b>ส่งทดสอบ</b> ด้านล่างเพื่อเช็กว่าข้อความเข้าจริง</p>
          <p className="text-gray-500 mt-1">
            ไม่อยากรับแล้วเมื่อไหร่ พิมพ์ <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">/stop</span> ในแชทบอทได้ทุกเมื่อ
          </p>
        </>
      ),
    },
  ]

  return (
    <div className="bg-[#FDF6EE] border border-[#F0E4D4] rounded-xl p-6 mb-6 max-w-xl print:border-gray-300">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[#7A4E2D]">วิธีเชื่อม Telegram (สำหรับคนไม่เคยใช้)</h2>
          <p className="text-xs text-[#9A7355] mt-0.5">ทำครั้งเดียวจบ ใช้เวลาประมาณ 5 นาที · ฟรี ไม่มีค่าข้อความ</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-[#7A4E2D] hover:bg-[#F0E4D4] px-2 py-1 rounded-lg shrink-0 print:hidden"
        >
          {open ? <>ย่อ <ChevronUp size={14} /></> : <>ดูวิธีทำ <ChevronDown size={14} /></>}
        </button>
      </div>

      {open && (
        <>
          <ol className="mt-5 space-y-4">
            {steps.map((step, i) => {
              const Icon = step.icon
              return (
                <li key={step.title} className="flex gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-[#C4865A] text-white grid place-items-center text-sm font-bold">
                    {i + 1}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <h3 className="flex items-center gap-1.5 font-medium text-gray-900 text-sm">
                      <Icon size={15} className="text-[#C4865A] shrink-0" />
                      {step.title}
                    </h3>
                    <div className="text-sm text-gray-600 mt-1 leading-relaxed">{step.body}</div>
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-[#F0E4D4] print:hidden">
            <a
              href={botLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <ExternalLink size={15} /> เปิดบอท Telegram
            </a>
            <button
              onClick={copyLink}
              className="flex items-center gap-2 border border-[#E0CDB5] bg-white hover:bg-[#FDF6EE] text-[#7A4E2D] text-sm font-medium px-4 py-2 rounded-lg"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />} คัดลอกลิงก์บอท
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 border border-[#E0CDB5] bg-white hover:bg-[#FDF6EE] text-[#7A4E2D] text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Printer size={15} /> พิมพ์คู่มือ
            </button>
          </div>
        </>
      )}
    </div>
  )
}
