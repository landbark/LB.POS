'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function NewCountButton({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [saving, setSaving] = useState(false)

  async function create() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('stock_counts')
      .insert({
        // เลขรอบไม่ต้องสวย ขอแค่ไม่ซ้ำ — เหมือนเลขใบสั่งซื้อ (PO…)
        count_number: `SC${Date.now()}`,
        name: name.trim() || null,
        category_id: categoryId || null,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()

    setSaving(false)
    if (error || !data) {
      toast.error('เปิดรอบนับไม่สำเร็จ: ' + (error?.message ?? ''))
      return
    }
    router.push(`/admin/stock-count/${data.id}`)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0"
      >
        <Plus size={16} /> เปิดรอบนับ
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">เปิดรอบนับใหม่</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>

        <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อรอบ (ไม่ใส่ก็ได้)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น นับอาหารแมว ชั้น A"
          className={`${inputClass} mb-3`}
        />

        <label className="block text-xs font-medium text-gray-600 mb-1">ขอบเขต</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${inputClass} mb-1`}>
          <option value="">ทั้งร้าน</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>เฉพาะหมวด {c.name}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mb-4">
          เลือกหมวดไว้เพื่อรู้ว่ารอบนี้ยังเหลืออะไรยังไม่นับ — ยิงสินค้านอกหมวดก็ยังนับได้
        </p>

        <button
          onClick={create}
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
        >
          {saving ? 'กำลังเปิดรอบ...' : 'เริ่มนับ'}
        </button>
      </div>
    </div>
  )
}
