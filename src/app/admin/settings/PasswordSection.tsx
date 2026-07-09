'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'

export default function PasswordSection() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร')
      return
    }
    if (password !== confirm) {
      toast.error('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      toast.error(
        error.message.includes('different from the old')
          ? 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม'
          : 'เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + error.message
      )
      return
    }
    toast.success('เปลี่ยนรหัสผ่านแล้ว')
    setPassword('')
    setConfirm('')
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">เปลี่ยนรหัสผ่านของฉัน</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        ใช้สำหรับเข้าระบบด้วยอีเมล+รหัสผ่าน (บัญชี Google ก็ตั้งรหัสผ่านเพิ่มได้)
      </p>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่านใหม่</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="อย่างน้อย 6 ตัวอักษร"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ยืนยันรหัสผ่านใหม่</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
            placeholder="พิมพ์อีกครั้ง"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
        >
          {loading ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
        </button>
      </form>
    </section>
  )
}
