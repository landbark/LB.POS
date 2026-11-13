'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2, X, Check, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import SearchBox from '@/components/SearchBox'
import toast from 'react-hot-toast'
import type { Customer } from '@/lib/types'
import { confirmDialog } from '@/lib/confirm'
import { SORT_COLUMNS, type SortDir, type SortKey } from './sorting'

const emptyForm = { name: '', last_name: '', phone: '', address: '' }

/**
 * แถวหัวตารางที่กดเรียงได้ — เขียนคอลัมน์/ทิศลง ?sort= &dir= แล้วให้ server เรียงใหม่ทั้งตาราง
 * (อยู่นอก CustomersClient เพราะ component ที่สร้างตอน render ทำให้ React remount ทุกรอบ)
 */
function SortableHead({ sortKey, sortDir }: { sortKey: SortKey; sortDir: SortDir }) {
  const params = useSearchParams()

  function header(column: SortKey, align: 'left' | 'right' = 'left') {
    const active = sortKey === column
    // กดคอลัมน์ที่เรียงอยู่ = สลับทิศ, กดคอลัมน์ใหม่ = เริ่มจากทิศที่คนส่วนใหญ่อยากเห็น
    const nextDir = active ? (sortDir === 'asc' ? 'desc' : 'asc') : SORT_COLUMNS[column].defaultDir
    const next = new URLSearchParams(params)
    next.set('sort', column)
    next.set('dir', nextDir)

    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

    return (
      <th
        key={column}
        className={`${align === 'right' ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase px-4 py-3`}
      >
        <Link
          href={`/admin/customers?${next}`}
          replace
          scroll={false}
          className={`group inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-gray-900' : 'hover:text-gray-700'}`}
          title={`เรียงตาม${SORT_COLUMNS[column].label} ${SORT_COLUMNS[column].dirs[nextDir]}`}
        >
          {SORT_COLUMNS[column].label}
          <Icon size={12} className={active ? 'text-blue-600' : 'opacity-0 group-hover:opacity-60'} />
        </Link>
      </th>
    )
  }

  return (
    <tr>
      {header('hn')}
      {header('full_name')}
      {header('phone')}
      {/* ชื่อสัตว์มาจากอีกตาราง (หลายตัวต่อคน) เรียงด้วยไม่ได้ */}
      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สัตว์เลี้ยง</th>
      {header('points', 'right')}
      {header('credit_balance', 'right')}
      {header('total_spent', 'right')}
      {header('created_at')}
      <th className="px-4 py-3"></th>
    </tr>
  )
}

export default function CustomersClient({
  customers,
  petNames,
  searching,
  note,
  atLimit,
  pageSize,
  sortKey,
  sortDir,
}: {
  customers: Customer[]
  /** customer_id → ชื่อสัตว์เลี้ยง (ทะเบียนคลินิก) */
  petNames: Record<string, string[]>
  /** กำลังมีคำค้นอยู่ — ใช้แยกข้อความตอนไม่พบผลลัพธ์ */
  searching: boolean
  /** คำที่ค้นเป็นของเก่าที่ถูกรวมไปแล้ว — บอกพนักงานว่าทำไมผลลัพธ์เป็นอีกชื่อ */
  note?: string | null
  /** ผลลัพธ์เต็มหน้า อาจมีมากกว่านี้ */
  atLimit: boolean
  pageSize: number
  /** คอลัมน์/ทิศทางที่ server เรียงมาให้แล้ว — หัวตารางแค่แสดงสถานะกับทำลิงก์สลับ */
  sortKey: SortKey
  sortDir: SortDir
}) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit(c: Customer) {
    setEditingId(c.id)
    setShowAdd(false)
    setForm({ name: c.name, last_name: c.last_name ?? '', phone: c.phone, address: c.address ?? '' })
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
    const payload = {
      name: form.name.trim(),
      last_name: form.last_name.trim() || null,
      phone: form.phone.trim(),
      address: form.address.trim() || null,
    }

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
    if (!(await confirmDialog({ message: `ลบ "${c.full_name}" ? ประวัติการซื้อเดิมจะยังอยู่ แค่ไม่ผูกกับลูกค้าคนนี้แล้ว` })).confirmed) return
    const supabase = createClient()
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
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
          <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อลูกค้า *</label>
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} placeholder="เช่น คุณสมชาย" autoFocus />
        </div>
        <div>
          {/* ไม่บังคับ — ลูกค้าส่วนใหญ่ไม่ให้นามสกุล มีไว้เติมเอกสารคลินิกที่ต้องใช้ชื่อเต็ม */}
          <label className="block text-xs font-medium text-gray-600 mb-1">
            นามสกุล <span className="font-normal text-gray-400">(ถ้ามี)</span>
          </label>
          <input type="text" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className={inputClass} placeholder="เช่น ใจดี" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">เบอร์โทร *</label>
          <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="08x-xxx-xxxx" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ที่อยู่</label>
          <textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} className={inputClass} placeholder="จดคร่าว ๆ ได้ เช่น ม.3 ต.บ้านใหม่ อ.เมือง" />
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

      <SearchBox placeholder="ค้นหา HN / ชื่อ / เบอร์โทร..." className="mb-4 max-w-xs" />

      {note && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {note}
        </p>
      )}

      {atLimit && (
        <p className="text-xs text-gray-500 mb-3">
          แสดง {pageSize} รายการแรกตามลำดับที่เรียงอยู่ — พิมพ์ค้นหาเพื่อจำกัดผลลัพธ์
        </p>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <SortableHead sortKey={sortKey} sortDir={sortDir} />
          </thead>
          <tbody className="divide-y divide-gray-50">
            {customers.map((c) => (
              editingId === c.id ? (
                <tr key={c.id}>
                  <td colSpan={9} className="px-4 py-3">{formCard}</td>
                </tr>
              ) : (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-500 whitespace-nowrap">{c.hn ?? '—'}</td>
                  <td className="px-4 py-3 text-sm font-medium">
                    <Link href={`/admin/customers/${c.id}`} className="text-gray-900 hover:text-blue-600" onClick={(e) => e.stopPropagation()}>
                      {c.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{c.phone}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {petNames[c.id]?.length
                      ? <Link href="/admin/pets" className="hover:text-blue-600">{petNames[c.id].join(', ')}</Link>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">{c.points.toLocaleString('th-TH')}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">
                    {c.credit_balance > 0 ? `฿${c.credit_balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
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
            {customers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                  {searching
                    ? 'ไม่พบลูกค้าที่ค้นหา'
                    : 'ยังไม่มีลูกค้า — เพิ่มได้ที่นี่ หรือพิมพ์เบอร์ลูกค้าที่หน้าขายเพื่อเพิ่มระหว่างขาย'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
