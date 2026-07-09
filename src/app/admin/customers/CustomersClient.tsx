'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2, X, Check, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Customer } from '@/lib/types'

const emptyForm = { name: '', phone: '' }

export default function CustomersClient({ customers }: { customers: Customer[] }) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit(c: Customer) {
    setEditingId(c.id)
    setShowAdd(false)
    setForm({ name: c.name, phone: c.phone })
  }

  function cancel() {
    setShowAdd(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('กรุณาใส่ชื่อและเบอร์โทร')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const payload = { name: form.name.trim(), phone: form.phone.trim() }

    const { error } = editingId
      ? await supabase.from('customers').update(payload).eq('id', editingId)
      : await supabase.from('customers').insert(payload)

    setLoading(false)
    if (error) {
      toast.error(error.code === '23505' ? 'มีลูกค้าเบอร์นี้อยู่แล้ว' : 'เกิดข้อผิดพลาด')
      return
    }
    toast.success(editingId ? 'แก้ไขแล้ว' : 'เพิ่มลูกค้าแล้ว')
    cancel()
    router.refresh()
  }

  async function remove(c: Customer) {
    if (!confirm(`ลบ "${c.name}" ? ประวัติการซื้อเดิมจะยังอยู่ แค่ไม่ผูกกับลูกค้าคนนี้แล้ว`)) return
    const supabase = createClient()
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
    if (error) {
      toast.error('ลบไม่สำเร็จ')
      return
    }
    toast.success('ลบแล้ว')
    router.refresh()
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
    : customers

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const formCard = (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อลูกค้า *</label>
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} placeholder="เช่น คุณสมชาย" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">เบอร์โทร *</label>
          <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="08x-xxx-xxxx" />
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ลูกค้า</h1>
        {!showAdd && !editingId && (
          <button
            onClick={() => { setShowAdd(true); setForm(emptyForm) }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} /> เพิ่มลูกค้า
          </button>
        )}
      </div>

      {showAdd && formCard}

      <div className="relative mb-4 max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อ / เบอร์โทร..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ชื่อ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เบอร์โทร</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">แต้มสะสม</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ยอดซื้อสะสม</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สมัครเมื่อ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((c) => (
              editingId === c.id ? (
                <tr key={c.id}>
                  <td colSpan={6} className="px-4 py-3">{formCard}</td>
                </tr>
              ) : (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{c.phone}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">{c.points.toLocaleString('th-TH')}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                    ฿{c.total_spent.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(c.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(c)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                        <Edit size={15} />
                      </button>
                      <button onClick={() => remove(c)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  {customers.length === 0
                    ? 'ยังไม่มีลูกค้า — เพิ่มได้ที่นี่ หรือพิมพ์เบอร์ลูกค้าที่หน้าขายเพื่อเพิ่มระหว่างขาย'
                    : 'ไม่พบลูกค้าที่ค้นหา'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
