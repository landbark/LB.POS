'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bell, Send, Trash2, Save, RefreshCw, ExternalLink, Check, X, Clock, Crown, Users } from 'lucide-react'
import TelegramSetupGuide from './TelegramSetupGuide'
import { DEFAULT_REMINDER_FOOTER } from '@/lib/types'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/lib/confirm'

interface NotifySettings {
  id: number
  enabled: boolean
  expiry_days: number
  notify_new_order?: boolean
  notify_payment_slip?: boolean
  notify_new_appointment?: boolean
  notify_shift_close?: boolean
  notify_daily_sales?: boolean
  notify_customer_appointment?: boolean
  customer_reminder_footer?: string | null
  cash_diff_threshold?: number
}

// เหตุการณ์ที่เด้งทันที (นอกเหนือจากสรุปรอบเช้า)
const EVENTS = [
  { key: 'notify_new_order', label: 'ออเดอร์ออนไลน์ใหม่', hint: 'ลูกค้ากดสั่งของบนเว็บร้าน' },
  { key: 'notify_payment_slip', label: 'ลูกค้าแนบสลิปโอนเงิน', hint: 'เตือนให้ไปตรวจสลิปและยืนยันออเดอร์' },
  { key: 'notify_new_appointment', label: 'มีการจองนัดใหม่', hint: 'ทันทีที่บันทึกนัดจากหน้านัดหมายหรือหน้า OPD' },
  { key: 'notify_shift_close', label: 'ปิดกะ / นับเงิน', hint: 'สรุปยอดขายในกะ + เงินขาดเกิน', ownerOnly: true },
  { key: 'notify_daily_sales', label: 'สรุปยอดขายรายวัน', hint: 'ส่งทุกเย็น 20:00 น. (เฉพาะวันที่มีการขาย)', ownerOnly: true },
] as const

type EventKey = (typeof EVENTS)[number]['key']

interface Recipient {
  id: string
  chat_id: string
  name: string | null
  approved: boolean
  is_owner?: boolean
  created_at: string
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export default function NotificationsClient({
  initialSettings,
  initialRecipients,
  botUsername,
  linkedCustomers,
}: {
  initialSettings: NotifySettings
  initialRecipients: Recipient[]
  botUsername: string
  linkedCustomers: number
}) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialSettings.enabled)
  const [expiryDays, setExpiryDays] = useState(String(initialSettings.expiry_days))
  // ก่อนรัน migration คอลัมน์ยังไม่มี (undefined) — ถือว่าเปิด ให้ตรงกับฝั่ง server
  const [events, setEvents] = useState<Record<EventKey, boolean>>(() =>
    Object.fromEntries(EVENTS.map((e) => [e.key, initialSettings[e.key] !== false])) as Record<EventKey, boolean>
  )
  const [cashThreshold, setCashThreshold] = useState(String(initialSettings.cash_diff_threshold ?? 0))
  const [customerAppt, setCustomerAppt] = useState(initialSettings.notify_customer_appointment !== false)
  const [footer, setFooter] = useState(initialSettings.customer_reminder_footer ?? DEFAULT_REMINDER_FOOTER)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const pending = initialRecipients.filter((r) => !r.approved)
  const approved = initialRecipients.filter((r) => r.approved)

  async function approveRecipient(r: Recipient) {
    setBusyId(r.id)
    try {
      const res = await fetch('/api/notify/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'อนุมัติไม่สำเร็จ')
      toast.success(`อนุมัติ "${r.name ?? 'ไม่มีชื่อ'}" แล้ว`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'อนุมัติไม่สำเร็จ')
    } finally {
      setBusyId(null)
    }
  }

  // ติ๊กว่าใครเป็นเจ้าของ — เฉพาะเจ้าของถึงจะได้ข้อความเรื่องเงิน (ปิดกะ / ยอดขายรายวัน)
  async function toggleOwner(r: Recipient) {
    setBusyId(r.id)
    const supabase = createClient()
    const { error } = await supabase
      .from('telegram_recipients')
      .update({ is_owner: !r.is_owner })
      .eq('id', r.id)
    setBusyId(null)
    if (error) toast.error(error.message)
    else router.refresh()
  }

  async function saveSettings() {
    const days = parseInt(expiryDays, 10)
    if (isNaN(days) || days < 1 || days > 365) {
      toast.error('จำนวนวันต้องอยู่ระหว่าง 1-365')
      return
    }
    const threshold = parseFloat(cashThreshold)
    if (isNaN(threshold) || threshold < 0) {
      toast.error('เกณฑ์เงินขาด/เกินต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('notify_settings')
      .update({
        enabled,
        expiry_days: days,
        ...events,
        notify_customer_appointment: customerAppt,
        customer_reminder_footer: footer,
        cash_diff_threshold: threshold,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setSaving(false)
    if (error) toast.error(error.message)
    else {
      toast.success('บันทึกแล้ว')
      router.refresh()
    }
  }

  async function removeRecipient(r: Recipient, isReject = false) {
    const msg = isReject
      ? `ปฏิเสธคำขอของ "${r.name ?? 'ไม่มีชื่อ'}"?`
      : `เอา "${r.name ?? 'ไม่มีชื่อ'}" ออกจากรายชื่อผู้รับแจ้งเตือน?`
    if (!(await confirmDialog({ message: msg })).confirmed) return
    setBusyId(r.id)
    const supabase = createClient()
    const { error } = await supabase.from('telegram_recipients').delete().eq('id', r.id)
    setBusyId(null)
    if (error) toast.error(error.message)
    else {
      toast.success(isReject ? 'ปฏิเสธแล้ว' : 'ลบแล้ว')
      router.refresh()
    }
  }

  async function sendTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/notify/test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'ส่งไม่สำเร็จ')
      if (data.reason === 'no_recipients') toast.error('ยังไม่มีผู้รับแจ้งเตือน — เชื่อม Telegram ก่อน')
      else if (data.failed) toast.error(`ส่งสำเร็จ ${data.recipients - data.failed}/${data.recipients} (บางคนล้มเหลว)`)
      else toast.success(`ส่งแล้วถึง ${data.recipients} คน`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ')
    } finally {
      setTesting(false)
    }
  }

  const inputClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const botLink = botUsername ? `https://t.me/${botUsername.replace(/^@/, '')}` : ''

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">แจ้งเตือน Telegram</h1>
      <p className="text-sm text-gray-500 mb-6">
        ส่งเข้ามือถือเจ้าของฟรี ไม่มีค่าข้อความ — เด้งทันทีเมื่อมีออเดอร์ใหม่ / ลูกค้าโอนเงิน / จองนัด / ปิดกะ
        และสรุปนัดหมายวันนี้ · สต็อคต่ำ · ใกล้หมดอายุ · นัดพรุ่งนี้ ทุกเช้า 8:00 น.
      </p>

      <TelegramSetupGuide
        botUsername={botUsername}
        botLink={botLink}
        hasApproved={approved.length > 0}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900">ตั้งค่า</h2>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 pb-4 mb-4 border-b border-gray-100 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          <span>
            เปิดใช้แจ้งเตือนทั้งหมด
            <span className="block text-xs text-gray-400 font-normal">ปิดอันนี้ = เงียบทุกอย่าง</span>
          </span>
        </label>

        <p className="text-xs font-medium text-gray-600 mb-2">เตือนเมื่อเกิดเหตุการณ์</p>
        <div className={`space-y-2.5 mb-4 ${enabled ? '' : 'opacity-40 pointer-events-none'}`}>
          {EVENTS.map((ev) => (
            <label key={ev.key} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={events[ev.key]}
                onChange={(e) => setEvents((prev) => ({ ...prev, [ev.key]: e.target.checked }))}
                className="w-4 h-4 mt-0.5 accent-blue-600"
              />
              <span>
                {ev.label}
                {'ownerOnly' in ev && ev.ownerOnly && (
                  <span className="ml-1.5 align-middle text-[10px] font-medium text-[#7A4E2D] bg-[#F0E4D4] px-1.5 py-0.5 rounded">
                    เฉพาะเจ้าของ
                  </span>
                )}
                <span className="block text-xs text-gray-400">{ev.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              เตือนสินค้าที่จะหมดอายุภายใน (วัน)
            </label>
            <input
              type="number" min={1} max={365}
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className={`${inputClass} w-28`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              เตือนปิดกะเมื่อเงินขาด/เกินตั้งแต่ (บาท)
            </label>
            <input
              type="number" min={0} step={1}
              value={cashThreshold}
              onChange={(e) => setCashThreshold(e.target.value)}
              className={`${inputClass} w-28`}
            />
            <p className="text-xs text-gray-400 mt-1">ใส่ 0 = เตือนทุกครั้งที่ปิดกะ</p>
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Save size={15} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Users size={18} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900">แจ้งเตือนเจ้าของสัตว์</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          ลูกค้าเชื่อม Telegram เองได้จากหน้าสมาชิก (<span className="font-mono bg-gray-100 px-1 rounded">/account</span>)
          — ไม่ต้องรออนุมัติ เพราะผูกผ่านลิงก์เฉพาะตัวที่ออกให้ตอนล็อกอินแล้ว
        </p>

        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={customerAppt}
            onChange={(e) => setCustomerAppt(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-blue-600"
          />
          <span>
            เตือนวันนัดให้เจ้าของสัตว์
            <span className="block text-xs text-gray-400">
              ส่งล่วงหน้า 1 วัน และซ้ำอีกครั้งเช้าวันนัด (รอบ 8:00 น.)
            </span>
          </span>
        </label>

        <div className={`mt-4 pt-4 border-t border-gray-100 ${customerAppt ? '' : 'opacity-40 pointer-events-none'}`}>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            ข้อความติดต่อท้ายข้อความเตือนนัด
          </label>
          <textarea
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            rows={3}
            placeholder="เว้นว่างไว้ = ไม่ต่อท้ายอะไรเลย"
            className={`${inputClass} w-full resize-y font-normal`}
          />
          <button
            type="button"
            onClick={() => setFooter(DEFAULT_REMINDER_FOOTER)}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            คืนค่าเริ่มต้น
          </button>

          <p className="mt-3 text-xs font-medium text-gray-600 mb-1">ตัวอย่างข้อความที่ลูกค้าจะได้รับ</p>
          <pre className="whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 font-sans leading-relaxed">
{`📅 พรุ่งนี้มีนัด ฉีดวัคซีน ของ โมจิ นะคะ

🗓️ วันศุกร์ที่ 18 กันยายน เวลา 10:30 น.${footer.trim() ? `\n\n${footer.trim()}` : ''}`}
          </pre>
        </div>

        <p className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600">
          ตอนนี้มีลูกค้าเชื่อม Telegram แล้ว{' '}
          <span className="font-semibold text-gray-900">{linkedCustomers}</span> คน
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          กด <b>บันทึก</b> ด้านบนเพื่อให้การเปลี่ยนแปลงมีผล
        </p>
      </div>

      {pending.length > 0 && (
        <div className="bg-amber-50 rounded-xl shadow-sm border border-amber-200 p-6 max-w-xl mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={18} className="text-amber-500" />
            <h2 className="font-semibold text-amber-900">รออนุมัติ ({pending.length})</h2>
          </div>
          <p className="text-xs text-amber-700 mb-4">
            มีคนขอรับแจ้งเตือน — อนุมัติเฉพาะคนที่คุณรู้จักเท่านั้น
          </p>
          <ul className="divide-y divide-amber-100">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm text-gray-900">{r.name ?? 'ไม่มีชื่อ'}</span>
                  <span className="text-xs text-gray-400 ml-2">ขอเมื่อ {fmtDate(r.created_at)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => approveRecipient(r)}
                    disabled={busyId === r.id}
                    className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg"
                  >
                    <Check size={14} /> อนุมัติ
                  </button>
                  <button
                    onClick={() => removeRecipient(r, true)}
                    disabled={busyId === r.id}
                    className="flex items-center gap-1 border border-gray-300 hover:bg-white disabled:opacity-50 text-gray-600 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                  >
                    <X size={14} /> ปฏิเสธ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Send size={18} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900">ผู้รับแจ้งเตือน</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          เปิดบอทใน Telegram แล้วพิมพ์ <span className="font-mono bg-gray-100 px-1 rounded">/start</span> เพื่อขอรับแจ้งเตือน (ต้องรอแอดมินอนุมัติ) — พิมพ์ <span className="font-mono bg-gray-100 px-1 rounded">/stop</span> เพื่อยกเลิก
        </p>

        {approved.length > 0 && !approved.some((r) => r.is_owner) && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            ยังไม่มีใครถูกตั้งเป็น <b>เจ้าของ</b> — ข้อความปิดกะและสรุปยอดขายรายวันจะไม่ถูกส่งหาใครเลย
            กดไอคอนมงกุฎหลังชื่อเพื่อตั้ง
          </p>
        )}

        {approved.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">ยังไม่มีผู้รับแจ้งเตือน</p>
        ) : (
          <ul className="divide-y divide-gray-100 mb-4">
            {approved.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 gap-2">
                <div className="min-w-0">
                  <span className="text-sm text-gray-900">{r.name ?? 'ไม่มีชื่อ'}</span>
                  {r.is_owner && (
                    <span className="ml-1.5 text-[10px] font-medium text-[#7A4E2D] bg-[#F0E4D4] px-1.5 py-0.5 rounded">
                      เจ้าของ
                    </span>
                  )}
                  <span className="text-xs text-gray-400 ml-2">เชื่อมเมื่อ {fmtDate(r.created_at)}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleOwner(r)}
                    disabled={busyId === r.id}
                    className={`p-1 disabled:opacity-50 ${r.is_owner ? 'text-[#C4865A]' : 'text-gray-300 hover:text-[#C4865A]'}`}
                    title={r.is_owner ? 'เอาสถานะเจ้าของออก (จะไม่ได้ข้อความเรื่องเงิน)' : 'ตั้งเป็นเจ้าของ (รับข้อความเรื่องเงินด้วย)'}
                  >
                    <Crown size={15} />
                  </button>
                  <button
                    onClick={() => removeRecipient(r)}
                    disabled={busyId === r.id}
                    className="text-gray-300 hover:text-red-500 disabled:opacity-50 p-1"
                    title="ลบออกจากรายชื่อ"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {botLink && (
            <a
              href={botLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <ExternalLink size={15} /> เปิดบอท Telegram
            </a>
          )}
          <button
            onClick={() => router.refresh()}
            className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg"
          >
            <RefreshCw size={15} /> รีเฟรชรายชื่อ
          </button>
          <button
            onClick={sendTest}
            disabled={testing || approved.length === 0}
            className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Send size={15} /> {testing ? 'กำลังส่ง...' : 'ส่งทดสอบ'}
          </button>
        </div>
      </div>
    </div>
  )
}
