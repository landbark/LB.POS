'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Ruler, Tag, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Item {
  id: string
  name: string
}

interface Props {
  title: string
  table: 'units' | 'categories'
  items: Item[]
  placeholder: string
  deleteHint: string
}

// จัดการรายการชื่ออย่างเดียว (หน่วยสินค้า / หมวดหมู่)
export default function NameListSection({ title, table, items, placeholder, deleteHint }: Props) {
  const router = useRouter()
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const Icon = table === 'units' ? Ruler : Tag

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from(table).insert({ name })
    setLoading(false)
    if (error) {
      toast.error(error.code === '23505' ? `มี "${name}" อยู่แล้ว` : 'เพิ่มไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success(`เพิ่ม "${name}" แล้ว`)
    setNewName('')
    router.refresh()
  }

  async function handleDelete(item: Item) {
    if (!confirm(`ลบ "${item.name}"?\n${deleteHint}`)) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from(table).delete().eq('id', item.id)
    setLoading(false)
    if (error) {
      toast.error('ลบไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success(`ลบ "${item.name}" แล้ว`)
    router.refresh()
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-400">({items.length})</span>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={placeholder}
        />
        <button
          type="submit"
          disabled={loading || !newName.trim()}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} /> เพิ่ม
        </button>
      </form>

      <ul className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-2 px-1 hover:bg-gray-50 rounded">
            <span className="text-sm text-gray-800">{item.name}</span>
            <button
              onClick={() => handleDelete(item)}
              disabled={loading}
              title={`ลบ "${item.name}"`}
              className="p-1.5 text-gray-300 hover:text-red-600 rounded"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-6 text-center text-sm text-gray-400">ยังไม่มีรายการ</li>
        )}
      </ul>
    </section>
  )
}
