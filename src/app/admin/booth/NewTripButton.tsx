'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { thaiToday } from '@/lib/thaiDate'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4865A]/40'

export default function NewTripButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState(thaiToday())
  const [float, setFloat] = useState('')

  async function create() {
    setSaving(true)
    const supabase = createClient()
    const { data: tripNumber, error: numError } = await supabase.rpc('next_booth_trip_number')
    if (numError || !tripNumber) {
      setSaving(false)
      toast.error('ออกเลขที่รอบไม่สำเร็จ: ' + (numError?.message ?? ''))
      return
    }

    const { data, error } = await supabase
      .from('booth_trips')
      .insert({
        trip_number: tripNumber,
        name: name.trim() || null,
        location: location.trim() || null,
        trip_date: date,
        float_cash: float.trim() ? parseFloat(float) : 0,
        opened_by: userId || null,
      })
      .select('id')
      .single()

    setSaving(false)
    if (error) {
      // unique index one_open_booth_trip — มีรอบค้างอยู่ ต้องปิดก่อน
      toast.error(
        error.code === '23505'
          ? 'มีรอบที่ยังเปิดอยู่ ต้องปิดรอบเดิมก่อนถึงจะเปิดรอบใหม่ได้'
          : 'เปิดรอบไม่สำเร็จ: ' + error.message,
      )
      return
    }
    toast.success('เปิดรอบแล้ว — ทำใบเบิกของที่จะยกไปได้เลย')
    router.push(`/admin/booth/${data.id}`)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-[#C4865A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b0754c]"
      >
        <Plus size={16} />
        เปิดรอบใหม่
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">เปิดรอบออกบูธ</h2>
          <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่องาน</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="เช่น ตลาดนัดสัตว์เลี้ยง" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">สถานที่</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="เช่น ลานหน้าห้าง" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เงินทอนที่เตรียมไป</label>
              <input type="number" min="0" step="1" value={float} onChange={(e) => setFloat(e.target.value)} className={inputClass} placeholder="0" />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            เงินทอนก้อนนี้แยกจากเก๊ะที่ร้าน — จดไว้เทียบตอนนับเงินกลับเท่านั้น ไม่กระทบยอดปิดกะ
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">ยกเลิก</button>
          <button
            onClick={create}
            disabled={saving}
            className="rounded-lg bg-[#C4865A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b0754c] disabled:opacity-50"
          >
            {saving ? 'กำลังเปิด...' : 'เปิดรอบ'}
          </button>
        </div>
      </div>
    </div>
  )
}
