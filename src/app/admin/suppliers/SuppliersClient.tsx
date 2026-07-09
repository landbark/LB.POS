'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Supplier } from '@/lib/types'

const emptyForm = { name: '', contact_name: '', phone: '', notes: '' }

export default function SuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit(s: Supplier) {
    setEditingId(s.id)
    setShowAdd(false)
    setForm({
      name: s.name,
      contact_name: s.contact_name ?? '',
      phone: s.phone ?? '',
      notes: s.notes ?? '',
    })
  }

  function cancel() {
    setShowAdd(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error('กรุณาใส่ชื่อบริษัท')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
    }

    const { error } = editingId
      ? await supabase.from('suppliers').update(payload).eq('id', editingId)
      : await supabase.from('suppliers').insert(payload)

    setLoading(false)
    if (error) {
      toast.error(error.code === '23505' ? 'มีชื่อบริษัทนี้อยู่แล้ว' : 'เกิดข้อผิดพลาด')
      return
    }
    toast.success(editingId ? 'แก้ไขแล้ว' : 'เพิ่มซัพพลายเออร์แล้ว')
    cancel()
    router.refresh()
  }

  async function remove(s: Supplier) {
    if (!confirm(`ลบ "${s.name}" ? สินค้าที่ผูกไว้จะไม่ถูกลบ แค่ไม่มีซัพพลายเออร์`)) return
    const supabase = createClient()
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
    if (error) {
      toast.error('ลบไม่สำเร็จ')
      return
    }
    toast.success('ลบแล้ว')
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const formCard = (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อบริษัท *</label>
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} placeholder="เช่น บจก.เพ็ทฟู้ดไทย" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อผู้ติดต่อ</label>
          <input type="text" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} className={inputClass} placeholder="เซลล์ / ผู้ประสานงาน" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">เบอร์โทร</label>
          <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="08x-xxx-xxxx" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ</label>
          <input type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputClass} placeholder="เช่น ส่งทุกวันจันทร์" />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={save} disabled={loading} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Check size={14} /> {loading ? 'บันทึก...' : 'บันทึก'}
        </button>
        <button onClick={cancel} className="flex items-center gap-1.5 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg">
          <X size={14} /> ยกเลิก
        </button>
      </div>
    </div>
  )

  return (
    <div>
      {!showAdd && !editingId && (
        <button
          onClick={() => { setShowAdd(true); setForm(emptyForm) }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors mb-4"
        >
          <Plus size={16} /> เพิ่มซัพพลายเออร์
        </button>
      )}

      {showAdd && formCard}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">บริษัท</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ผู้ติดต่อ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เบอร์โทร</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">หมายเหตุ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {suppliers.map((s) => (
              editingId === s.id ? (
                <tr key={s.id}>
                  <td colSpan={5} className="px-4 py-3">{formCard}</td>
                </tr>
              ) : (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.contact_name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{s.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                        <Edit size={15} />
                      </button>
                      <button onClick={() => remove(s)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                  ยังไม่มีซัพพลายเออร์ — กด &quot;เพิ่มซัพพลายเออร์&quot; เพื่อเริ่มต้น
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
