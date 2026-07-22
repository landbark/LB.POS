'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Plus, KeyRound, Trash2, X, Pencil, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StaffEmail } from '@/lib/types'

interface Props {
  staff: StaffEmail[]
  migrated: boolean
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

export default function StaffSection({ staff, migrated }: Props) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'cashier', password: '' })
  const [pwTarget, setPwTarget] = useState<StaffEmail | null>(null)
  const [newPw, setNewPw] = useState('')
  // แก้ชื่อในตารางได้ทุกคน รวมทั้งตัวเอง (ชื่อนี้ไปโผล่เป็นชื่อผู้ตรวจในเวชระเบียน)
  const [nameEditId, setNameEditId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')

  async function api(method: string, body: object) {
    setLoading(true)
    const res = await fetch('/api/admin/staff', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      toast.error(data.error ?? 'เกิดข้อผิดพลาด')
      return false
    }
    router.refresh()
    return true
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (await api('POST', form)) {
      toast.success(`เพิ่ม "${form.name}" แล้ว`)
      setForm({ name: '', email: '', role: 'cashier', password: '' })
      setAdding(false)
    }
  }

  async function handleRoleChange(s: StaffEmail, role: string) {
    if (await api('PATCH', { email: s.email, role })) {
      toast.success(`เปลี่ยนสิทธิ์ของ "${s.name}" แล้ว`)
    }
  }

  async function handleNameSave(s: StaffEmail) {
    const name = nameDraft.trim()
    if (!name || name === s.name) {
      setNameEditId(null)
      return
    }
    if (await api('PATCH', { email: s.email, name })) {
      toast.success(`เปลี่ยนชื่อเป็น "${name}" แล้ว`)
      setNameEditId(null)
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!pwTarget) return
    if (await api('PATCH', { email: pwTarget.email, password: newPw })) {
      toast.success(`ตั้งรหัสผ่านใหม่ให้ "${pwTarget.name}" แล้ว`)
      setPwTarget(null)
      setNewPw('')
    }
  }

  async function handleDelete(s: StaffEmail) {
    if (!confirm(`ลบ "${s.name}" (${s.email}) ออกจากรายชื่อพนักงาน?\nบัญชีนี้จะเข้าระบบไม่ได้อีก แต่ประวัติการขายยังอยู่`)) return
    if (await api('DELETE', { email: s.email })) {
      toast.success(`ลบ "${s.name}" แล้ว`)
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">พนักงาน</h2>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          {adding ? <X size={15} /> : <Plus size={15} />}
          {adding ? 'ปิดฟอร์ม' : 'เพิ่มพนักงาน'}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        เฉพาะอีเมลในรายชื่อนี้เท่านั้นที่เข้าระบบได้ — จะเข้าด้วย Google หรือรหัสผ่านที่ตั้งให้ก็ได้
      </p>

      {!migrated && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4">
          ยังไม่ได้รัน migration — รันไฟล์ <code className="font-mono">supabase-migration-settings.sql</code> ใน
          Supabase SQL Editor ก่อน ส่วนจัดการพนักงานถึงจะใช้งานได้
        </div>
      )}

      {adding && (
        <form onSubmit={handleAdd} className="bg-gray-50 rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>ชื่อ *</label>
            <input
              type="text" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass} placeholder="เช่น น้องแนน" autoFocus
            />
          </div>
          <div>
            <label className={labelClass}>อีเมล *</label>
            <input
              type="email" required value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass} placeholder="staff@gmail.com"
            />
          </div>
          <div>
            <label className={labelClass}>สิทธิ์</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className={inputClass}
            >
              <option value="cashier">พนักงานขาย</option>
              <option value="vet">สัตวแพทย์</option>
              <option value="admin">เจ้าของร้าน</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>รหัสผ่าน (ไม่บังคับ)</label>
            <input
              type="text" minLength={6} value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputClass} placeholder="เว้นว่าง = ให้เข้าด้วย Google"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit" disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
            >
              {loading ? 'กำลังบันทึก...' : 'เพิ่มพนักงาน'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ชื่อ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">อีเมล</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สิทธิ์</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {staff.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {nameEditId === s.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={nameDraft}
                        autoFocus
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleNameSave(s)
                          if (e.key === 'Escape') setNameEditId(null)
                        }}
                        className="w-40 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button onClick={() => handleNameSave(s)} disabled={loading} title="บันทึก" className="p-1.5 text-gray-400 hover:text-green-600 rounded">
                        <Check size={15} />
                      </button>
                      <button onClick={() => setNameEditId(null)} title="ยกเลิก" className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setNameEditId(s.id); setNameDraft(s.name) }}
                      title="แก้ไขชื่อ"
                      className="group flex items-center gap-1.5 text-left"
                    >
                      {s.name}
                      <Pencil size={13} className="text-gray-300 group-hover:text-blue-600" />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={s.role}
                    disabled={loading}
                    onChange={(e) => handleRoleChange(s, e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="cashier">พนักงานขาย</option>
                    <option value="vet">สัตวแพทย์</option>
                    <option value="admin">เจ้าของร้าน</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                    s.user_id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {s.user_id ? 'เข้าระบบแล้ว' : 'รอเข้าครั้งแรก'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => { setPwTarget(s); setNewPw('') }}
                      title="ตั้งรหัสผ่านใหม่"
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                    >
                      <KeyRound size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      title="ลบออกจากรายชื่อ"
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  ยังไม่มีรายชื่อพนักงาน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* modal ตั้งรหัสผ่านใหม่ */}
      {pwTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setPwTarget(null)}>
          <form
            onSubmit={handleSetPassword}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm"
          >
            <h3 className="text-base font-semibold text-gray-900 mb-1">ตั้งรหัสผ่านใหม่</h3>
            <p className="text-sm text-gray-500 mb-4">{pwTarget.name} — {pwTarget.email}</p>
            <input
              type="text" required minLength={6} value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className={inputClass} placeholder="อย่างน้อย 6 ตัวอักษร" autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button
                type="submit" disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm"
              >
                {loading ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button
                type="button" onClick={() => setPwTarget(null)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
