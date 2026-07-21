'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bell, Send, Trash2, Save, RefreshCw, ExternalLink, Check, X, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

interface NotifySettings {
  id: number
  enabled: boolean
  expiry_days: number
}

interface Recipient {
  id: string
  chat_id: string
  name: string | null
  approved: boolean
  created_at: string
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export default function NotificationsClient({
  initialSettings,
  initialRecipients,
  botUsername,
}: {
  initialSettings: NotifySettings
  initialRecipients: Recipient[]
  botUsername: string
}) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialSettings.enabled)
  const [expiryDays, setExpiryDays] = useState(String(initialSettings.expiry_days))
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

  async function saveSettings() {
    const days = parseInt(expiryDays, 10)
    if (isNaN(days) || days < 1 || days > 365) {
      toast.error('จำนวนวันต้องอยู่ระหว่าง 1-365')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('notify_settings')
      .update({ enabled, expiry_days: days, updated_at: new Date().toISOString() })
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
    if (!confirm(msg)) return
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
        ระบบส่งสรุปสต็อคต่ำ / สินค้าใกล้หมดอายุ เข้า Telegram ทุกเช้า 8:00 น. (เฉพาะวันที่มีรายการต้องเตือน)
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900">ตั้งค่า</h2>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          เปิดใช้แจ้งเตือนอัตโนมัติทุกเช้า
        </label>

        <label className="block text-xs font-medium text-gray-600 mb-1">
          เตือนสินค้าที่จะหมดอายุภายใน (วัน)
        </label>
        <input
          type="number" min={1} max={365}
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value)}
          className={`${inputClass} w-28`}
        />

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

        {approved.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">ยังไม่มีผู้รับแจ้งเตือน</p>
        ) : (
          <ul className="divide-y divide-gray-100 mb-4">
            {approved.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm text-gray-900">{r.name ?? 'ไม่มีชื่อ'}</span>
                  <span className="text-xs text-gray-400 ml-2">เชื่อมเมื่อ {fmtDate(r.created_at)}</span>
                </div>
                <button
                  onClick={() => removeRecipient(r)}
                  disabled={busyId === r.id}
                  className="text-gray-300 hover:text-red-500 disabled:opacity-50 p-1"
                  title="ลบออกจากรายชื่อ"
                >
                  <Trash2 size={15} />
                </button>
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
