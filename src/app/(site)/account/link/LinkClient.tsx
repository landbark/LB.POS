'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

const inputClass =
  'w-full rounded-lg border border-brand-muted/40 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-brown/40'

export default function LinkClient({ displayName, next }: { displayName: string; next: string }) {
  const router = useRouter()
  const [name, setName] = useState(displayName)
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const res = await fetch('/api/shop/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      toast.error(data.error ?? 'ผูกบัญชีไม่สำเร็จ')
      return
    }

    toast.success(data.isNew ? 'สมัครสมาชิกเรียบร้อย' : 'ผูกบัญชีกับสมาชิกเดิมแล้ว')
    router.push(next)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="max-w-md mx-auto rounded-xl bg-white border border-brand-muted/30 p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-brand-dark">ผูกบัญชีกับสมาชิกของร้าน</h1>
        <p className="mt-1 text-sm text-gray-500">
          กรอกเบอร์โทรที่เคยให้ไว้กับร้าน — ถ้าเป็นสมาชิกอยู่แล้วจะผูกแต้มสะสมเดิมให้ ถ้ายังไม่เคย ระบบจะสมัครให้ใหม่
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อของคุณ" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทร *</label>
        <input
          className={inputClass}
          required
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08xxxxxxxx"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl bg-brand-brown text-white font-medium disabled:opacity-50"
      >
        {loading ? 'กำลังผูกบัญชี...' : 'ยืนยัน'}
      </button>
    </form>
  )
}
