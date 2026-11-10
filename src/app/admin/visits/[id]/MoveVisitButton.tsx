'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeftRight, Loader2, Search, X } from 'lucide-react'
import { useLookup } from '@/lib/use-lookup'
import { confirmDialog } from '@/lib/confirm'

interface PetOption {
  id: string
  hn: string | null
  name: string
  species: string
  customer_id: string
  customers?: { id: string; name: string; phone: string } | null
}

/**
 * ย้ายใบตรวจใบนี้ไปอยู่กับสัตว์อีกตัว
 *
 * ใช้ตอนพนักงานลงผลตรวจผิดตัว — ถ้าเป็น "ใบซ้ำของตัวเดียวกัน" ให้ใช้หน้ารวมข้อมูลซ้ำแทน
 * (รวมทีเดียวได้ทั้งประวัติ ไม่ต้องย้ายทีละใบ)
 */
export default function MoveVisitButton({
  visitId,
  visitNumber,
  currentPetLabel,
  currentOwnerId,
  vaccineCount,
  docCount,
  billed,
}: {
  visitId: string
  visitNumber: string
  currentPetLabel: string
  currentOwnerId: string | null
  /** วัคซีนที่ลงไว้ในใบตรวจนี้ — ย้ายตามไปด้วย */
  vaccineCount: number
  /** เอกสารคลินิกที่ออกจากใบตรวจนี้ */
  docCount: number
  /** ออกบิลไปแล้ว — เตือนว่าใบเสร็จยังเป็นชื่อเจ้าของเดิม */
  billed: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<PetOption | null>(null)
  const [moveOwner, setMoveOwner] = useState(true)
  const [saving, setSaving] = useState(false)

  const { results, loading } = useLookup<PetOption>('pets', query, open && !picked)

  const ownerChanges = !!picked && picked.customer_id !== currentOwnerId

  function close() {
    setOpen(false)
    setQuery('')
    setPicked(null)
    setMoveOwner(true)
  }

  async function submit() {
    if (!picked) return

    const willMove = [
      'บันทึกการตรวจ รายการยา การวินิจฉัย และรูปแนบทั้งใบ',
      vaccineCount > 0 ? `วัคซีนที่ลงในใบนี้ ${vaccineCount} เข็ม` : null,
      docCount > 0 ? `เอกสารคลินิกที่ออกจากใบนี้ ${docCount} ใบ` : null,
    ].filter(Boolean)

    const confirmed = await confirmDialog({
      title: `ย้ายใบตรวจ ${visitNumber}`,
      message:
        `จาก: ${currentPetLabel}\n` +
        `ไปที่: ${picked.hn ? picked.hn + ' ' : ''}${picked.name} (${picked.customers?.name ?? 'ไม่ระบุเจ้าของ'})\n\n` +
        `ย้ายไปด้วย: ${willMove.join(' · ')}\n` +
        'นัดหมายไม่ย้าย — เป็นคิวของสัตว์ตัวเดิมที่ตั้งไว้ต่างหาก' +
        (ownerChanges && moveOwner ? `\n\nชื่อเจ้าของในใบนี้จะเปลี่ยนเป็น ${picked.customers?.name ?? '—'}` : ''),
      confirmLabel: 'ย้ายเลย',
      tone: 'danger',
    })
    if (!confirmed.confirmed) return

    setSaving(true)
    const res = await fetch('/api/admin/visit-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitId, petId: picked.id, moveOwner: ownerChanges && moveOwner }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      toast.error(data.error ?? 'ย้ายไม่สำเร็จ')
      return
    }

    toast.success(`ย้ายไปที่ ${picked.name} แล้ว`)
    close()
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border border-gray-300 text-gray-600 text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-50"
        title="ลงผลตรวจผิดตัว? ย้ายใบนี้ไปอยู่กับสัตว์ตัวที่ถูก"
      >
        <ArrowLeftRight size={13} /> ย้ายไปสัตว์ตัวอื่น
      </button>
    )
  }

  return (
    <div className="mt-3 border border-blue-200 bg-blue-50/50 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-medium text-gray-900">ย้ายใบตรวจนี้ไปสัตว์ตัวอื่น</p>
          <p className="text-xs text-gray-500">
            สำหรับใบที่ลงผิดตัว — ถ้าเป็นสัตว์ตัวเดียวกันที่มีสองใบ ใช้หน้า &ldquo;รวมข้อมูลซ้ำ&rdquo; จะได้ทั้งประวัติในครั้งเดียว
          </p>
        </div>
        <button onClick={close} className="text-gray-400 hover:text-gray-600 shrink-0">
          <X size={16} />
        </button>
      </div>

      {picked ? (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <span className="font-mono text-xs text-gray-400">{picked.hn ?? '—'}</span>
          <span className="text-sm font-medium text-gray-900">{picked.name}</span>
          <span className="text-xs text-gray-500">{picked.customers?.name}</span>
          <button onClick={() => setPicked(null)} className="ml-auto text-xs text-blue-600 hover:underline">
            เปลี่ยน
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหา HN / ชื่อสัตว์ / ชื่อเจ้าของ / เบอร์..."
              className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
          </div>

          {query.trim() && !loading && (
            <div className="mt-2 bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
              {results.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">ไม่พบสัตว์ที่ค้นหา</p>}
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPicked(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className="font-mono text-xs text-gray-400">{p.hn ?? '—'}</span>
                  <span className="font-medium text-gray-800">{p.name}</span>
                  <span className="text-xs text-gray-500">{p.customers?.name}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {picked && (
        <>
          <ul className="text-xs text-gray-600 mt-3 space-y-0.5">
            <li>· บันทึกการตรวจ รายการยา การวินิจฉัย และรูปแนบ ย้ายไปทั้งใบ</li>
            {vaccineCount > 0 && <li>· วัคซีนที่ลงในใบนี้ {vaccineCount} เข็ม ย้ายตามไปด้วย</li>}
            {docCount > 0 && <li>· เอกสารคลินิกที่ออกจากใบนี้ {docCount} ใบ ย้ายตามไปด้วย (เลขที่เอกสารไม่เปลี่ยน)</li>}
            <li>· นัดหมายไม่ย้าย — เป็นคิวที่ตั้งไว้กับสัตว์ตัวเดิมต่างหาก</li>
          </ul>

          {ownerChanges && (
            <label className="flex items-start gap-2 mt-3 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={moveOwner}
                onChange={(e) => setMoveOwner(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                เปลี่ยนชื่อเจ้าของในใบนี้เป็น <strong>{picked.customers?.name ?? '—'}</strong> ด้วย
                <span className="block text-gray-400">
                  ไม่ติ๊ก = คงชื่อคนที่พามาวันนั้นไว้ตามเดิม
                  {billed && ' · ใบเสร็จที่ออกไปแล้วยังเป็นชื่อเจ้าของเดิมไม่ว่าจะติ๊กหรือไม่'}
                </span>
              </span>
            </label>
          )}

          <button
            onClick={submit}
            disabled={saving}
            className="mt-3 flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <ArrowLeftRight size={15} />}
            {saving ? 'กำลังย้าย...' : 'ย้ายใบตรวจ'}
          </button>
        </>
      )}
    </div>
  )
}
