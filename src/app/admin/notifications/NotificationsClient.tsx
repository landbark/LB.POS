'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bell, Send, Trash2, MessageCircle, Save } from 'lucide-react'
import toast from 'react-hot-toast'

interface NotifySettings {
  id: number
  enabled: boolean
  expiry_days: number
}

interface Recipient {
  id: string
  line_user_id: string
  display_name: string | null
  created_at: string
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export default function NotificationsClient({
  initialSettings,
  initialRecipients,
}: {
  initialSettings: NotifySettings
  initialRecipients: Recipient[]
}) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialSettings.enabled)
  const [expiryDays, setExpiryDays] = useState(String(initialSettings.expiry_days))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // flow เชื่อม LINE อยู่ที่ /member/notify-link — LIFF ยอม redirect กลับเฉพาะ URL ใต้ endpoint (/member)
  function startLink() {
    router.push('/member/notify-link')
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
      .from('line_notify_settings')
      .update({ enabled, expiry_days: days, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSaving(false)
    if (error) toast.error(error.message)
    else {
      toast.success('บันทึกแล้ว')
      router.refresh()
    }
  }

  async function removeRecipient(r: Recipient) {
    if (!confirm(`เอา "${r.display_name ?? 'ไม่มีชื่อ'}" ออกจากรายชื่อผู้รับแจ้งเตือน?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('line_notify_recipients').delete().eq('id', r.id)
    if (error) toast.error(error.message)
    else {
      toast.success('ลบแล้ว')
      router.refresh()
    }
  }

  async function sendTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/line-notify/test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'ส่งไม่สำเร็จ')
      if (data.reason === 'no_recipients') toast.error('ยังไม่มีผู้รับแจ้งเตือน — กดเชื่อม LINE ก่อน')
      else toast.success(`ส่งแล้วถึง ${data.recipients} คน`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ')
    } finally {
      setTesting(false)
    }
  }

  const inputClass = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">แจ้งเตือน LINE</h1>
      <p className="text-sm text-gray-500 mb-6">
        ระบบส่งสรุปสต็อคต่ำ / สินค้าใกล้หมดอายุ เข้า LINE ทุกเช้า 8:00 น. (เฉพาะวันที่มีรายการต้องเตือน)
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl mb-6">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle size={18} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900">ผู้รับแจ้งเตือน</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          ต้องเพิ่มเพื่อน LINE OA ของร้าน (LANDBARK) ก่อน ถึงจะได้รับข้อความ
        </p>

        {initialRecipients.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">ยังไม่มีผู้รับแจ้งเตือน</p>
        ) : (
          <ul className="divide-y divide-gray-100 mb-4">
            {initialRecipients.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm text-gray-900">{r.display_name ?? 'ไม่มีชื่อ'}</span>
                  <span className="text-xs text-gray-400 ml-2">เชื่อมเมื่อ {fmtDate(r.created_at)}</span>
                </div>
                <button
                  onClick={() => removeRecipient(r)}
                  className="text-gray-300 hover:text-red-500 p-1"
                  title="ลบออกจากรายชื่อ"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={startLink}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <MessageCircle size={15} /> เชื่อม LINE ของฉัน
          </button>
          <button
            onClick={sendTest}
            disabled={testing || initialRecipients.length === 0}
            className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Send size={15} /> {testing ? 'กำลังส่ง...' : 'ส่งทดสอบ'}
          </button>
        </div>
      </div>
    </div>
  )
}
