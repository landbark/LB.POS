'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { Bell, BellOff, Smartphone, UserPlus, Link2, Check, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  linked: boolean
  notifyEnabled: boolean
  botConfigured: boolean
}

export default function TelegramConnect({ linked, notifyEnabled, botConfigured }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [howTo, setHowTo] = useState(false)
  // เก็บลิงก์ไว้โชว์ QR เผื่อลูกค้าเปิดเว็บจากคอม แล้วต้องสแกนด้วยมือถือ
  const [linkUrl, setLinkUrl] = useState<string | null>(null)

  if (!botConfigured) return null

  async function connect() {
    setBusy(true)
    try {
      const res = await fetch('/api/shop/telegram', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'ขอลิงก์ไม่สำเร็จ')

      setLinkUrl(data.url)
      // มือถือ: เด้งเข้าแอป Telegram เลย · คอม: จะถูกบล็อกบ้าง ค่อยใช้ QR/ลิงก์ด้านล่าง
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ขอลิงก์ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function toggleNotify() {
    setBusy(true)
    const res = await fetch('/api/shop/telegram', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !notifyEnabled }),
    })
    setBusy(false)
    if (!res.ok) { toast.error('บันทึกไม่สำเร็จ'); return }
    toast.success(notifyEnabled ? 'ปิดแจ้งเตือนแล้ว' : 'เปิดแจ้งเตือนแล้ว')
    router.refresh()
  }

  async function disconnect() {
    setBusy(true)
    const res = await fetch('/api/shop/telegram', { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { toast.error('ยกเลิกไม่สำเร็จ'); return }
    toast.success('ยกเลิกการเชื่อมต่อแล้ว')
    setLinkUrl(null)
    router.refresh()
  }

  if (linked) {
    return (
      <div className="rounded-xl bg-white border border-brand-muted/30 p-5">
        <div className="flex items-center gap-2">
          <Check size={18} className="text-green-600 shrink-0" />
          <h2 className="font-bold text-brand-dark">เชื่อมต่อ Telegram แล้ว</h2>
        </div>
        <p className="mt-1.5 text-sm text-gray-600">
          {notifyEnabled
            ? 'เราจะเตือนวันนัดของน้องให้ล่วงหน้า 1 วัน และเช้าวันนัดอีกครั้ง'
            : 'ตอนนี้ปิดการแจ้งเตือนอยู่ — เปิดใหม่ได้ทุกเมื่อ'}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={toggleNotify}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-brown text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {notifyEnabled ? <BellOff size={16} /> : <Bell size={16} />}
            {notifyEnabled ? 'ปิดแจ้งเตือนชั่วคราว' : 'เปิดแจ้งเตือน'}
          </button>
          <button
            onClick={disconnect}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-brand-muted/30 text-sm text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
          >
            ยกเลิกการเชื่อมต่อ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-white border border-brand-muted/30 p-5">
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-brand-brown shrink-0" />
        <h2 className="font-bold text-brand-dark">รับแจ้งเตือนวันนัด</h2>
      </div>
      <p className="mt-1.5 text-sm text-gray-600">
        เชื่อม Telegram ไว้ แล้วเราจะเตือนวันนัดของน้องให้ล่วงหน้า 1 วัน และเช้าวันนัดอีกครั้ง
        จะได้ไม่ลืมค่ะ — <span className="text-brand-dark font-medium">ฟรี ไม่มีค่าใช้จ่าย</span>
      </p>

      <button
        onClick={connect}
        disabled={busy}
        className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#229ED9] text-white font-medium hover:opacity-90 disabled:opacity-50"
      >
        <Link2 size={18} /> {busy ? 'กำลังสร้างลิงก์...' : 'เชื่อมต่อ Telegram'}
      </button>

      {linkUrl && (
        <div className="mt-4 rounded-xl bg-brand-light border border-brand-muted/30 p-4">
          <p className="text-sm text-brand-dark font-medium">เปิดแอป Telegram ไม่ขึ้น?</p>
          <p className="mt-1 text-xs text-gray-600">
            กด <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-[#229ED9] underline">ลิงก์นี้</a> อีกครั้ง
            หรือถ้าดูจากคอม ให้สแกน QR ด้านล่างด้วยมือถือที่มี Telegram
          </p>
          <div className="mt-3 inline-block bg-white p-3 rounded-lg border border-brand-muted/30">
            <QRCodeSVG value={linkUrl} size={140} level="M" />
          </div>
          <p className="mt-2 text-xs text-gray-500">ลิงก์นี้ใช้ได้ 30 นาที และใช้ได้ครั้งเดียว</p>
        </div>
      )}

      <button
        onClick={() => setHowTo((v) => !v)}
        className="mt-4 flex items-center gap-1 text-xs font-medium text-brand-dark hover:underline"
      >
        ยังไม่เคยใช้ Telegram? {howTo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {howTo && (
        <ol className="mt-3 space-y-3 border-t border-brand-muted/20 pt-3">
          {[
            {
              icon: Smartphone,
              title: 'ลงแอป Telegram',
              body: 'เปิด App Store (iPhone) หรือ Play Store (Android) ค้นหาคำว่า Telegram แล้วกดติดตั้ง — แอปฟรี ไอคอนเป็นเครื่องบินกระดาษสีขาวบนพื้นฟ้า',
            },
            {
              icon: UserPlus,
              title: 'สมัครด้วยเบอร์มือถือ',
              body: 'เปิดแอป → เลือกประเทศ Thailand → ใส่เบอร์มือถือ → กรอกรหัสที่ส่งมาทาง SMS → ใส่ชื่อ เป็นอันเสร็จ ใช้เบอร์เดิมได้เลย',
            },
            {
              icon: Link2,
              title: 'กลับมากดปุ่มเชื่อมต่อด้านบน',
              body: 'แอป Telegram จะเปิดขึ้นมาเอง กดปุ่ม START สีฟ้าที่ก้นหน้าจอหนึ่งครั้ง แล้วบอทจะทักกลับว่าเชื่อมต่อสำเร็จ',
            },
          ].map((step, i) => {
            const Icon = step.icon
            return (
              <li key={step.title} className="flex gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-brand-brown text-white grid place-items-center text-xs font-bold">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 text-sm font-medium text-brand-dark">
                    <Icon size={14} className="text-brand-brown shrink-0" />
                    {step.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-600 leading-relaxed">{step.body}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
