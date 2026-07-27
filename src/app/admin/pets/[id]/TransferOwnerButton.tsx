'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRightLeft, X, Check, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'

type OwnerOption = { id: string; name: string; phone: string }

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function TransferOwnerButton({
  petId,
  petName,
  currentOwnerId,
  customers,
}: {
  petId: string
  petName: string
  currentOwnerId: string | null
  customers: OwnerOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'pick' | 'new'>('pick')
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [loading, setLoading] = useState(false)

  function reset() {
    setOpen(false)
    setMode('pick')
    setQuery('')
    setNewName('')
    setNewPhone('')
  }

  const q = query.trim().toLowerCase()
  const matches = q
    ? customers.filter((c) => c.id !== currentOwnerId && (c.name.toLowerCase().includes(q) || c.phone.includes(q))).slice(0, 8)
    : []

  async function transferTo(newOwnerId: string, ownerLabel: string) {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('pets').update({ customer_id: newOwnerId }).eq('id', petId)
    setLoading(false)
    if (error) {
      toast.error('ย้ายเจ้าของไม่สำเร็จ')
      return
    }
    toast.success(`ย้าย "${petName}" ไปเป็นของ ${ownerLabel} แล้ว`)
    reset()
    router.refresh()
  }

  async function pickExisting(c: OwnerOption) {
    if (!confirm(`ย้าย "${petName}" ไปเป็นของ ${c.name} (${c.phone})?\nประวัติการรักษาเดิมยังอยู่ครบกับผู้พามาตอนนั้น`)) return
    await transferTo(c.id, c.name)
  }

  async function createAndTransfer() {
    const name = newName.trim()
    const phone = newPhone.trim()
    if (!name) { toast.error('กรุณาใส่ชื่อเจ้าของใหม่'); return }
    if (!phone) { toast.error('กรุณาใส่เบอร์โทร'); return }

    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('customers')
      .insert({ name, phone })
      .select('id')
      .single()

    if (error || !data) {
      setLoading(false)
      // เบอร์ซ้ำ = ลูกค้ามีอยู่แล้ว บอกให้ไปค้นหาแทน
      toast.error(error?.code === '23505' ? 'เบอร์นี้มีลูกค้าอยู่แล้ว — ค้นหาชื่อ/เบอร์ในช่องด้านบนแทน' : 'สร้างลูกค้าไม่สำเร็จ')
      return
    }
    await transferTo(data.id, name)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded-lg px-2 py-1"
      >
        <ArrowRightLeft size={13} /> เปลี่ยนเจ้าของ
      </button>
    )
  }

  return (
    <div className="w-full mt-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600">ย้าย &quot;{petName}&quot; ไปเจ้าของใหม่</p>
        <button onClick={reset} className="p-1 text-gray-400 hover:text-gray-700"><X size={14} /></button>
      </div>

      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setMode('pick')}
          className={`text-xs px-3 py-1.5 rounded-lg ${mode === 'pick' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
        >
          ลูกค้าที่มีอยู่
        </button>
        <button
          onClick={() => setMode('new')}
          className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg ${mode === 'new' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
        >
          <UserPlus size={12} /> สร้างลูกค้าใหม่
        </button>
      </div>

      {mode === 'pick' ? (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputClass}
            placeholder="พิมพ์ชื่อ / เบอร์โทรลูกค้า..."
            autoFocus
          />
          {matches.length > 0 && (
            <div className="mt-1 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              {matches.map((c) => (
                <button
                  key={c.id}
                  disabled={loading}
                  onClick={() => pickExisting(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {c.name} <span className="text-gray-400 font-mono">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
          {q && matches.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">ไม่พบลูกค้า — กด &quot;สร้างลูกค้าใหม่&quot; ได้เลย</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} placeholder="ชื่อเจ้าของใหม่ *" autoFocus />
          <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className={inputClass} placeholder="เบอร์โทร *" />
          <button
            onClick={createAndTransfer}
            disabled={loading}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Check size={14} /> {loading ? 'บันทึก...' : 'สร้าง + ย้ายเจ้าของ'}
          </button>
        </div>
      )}
    </div>
  )
}
