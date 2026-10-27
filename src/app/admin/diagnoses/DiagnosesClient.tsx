'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, GitMerge, HeartPulse, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Diagnosis } from '@/lib/types'
import { composeBreed } from '@/lib/pets'
import { searchDiagnoses } from '@/lib/diagnoses'
import { confirmDialog } from '@/lib/confirm'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function DiagnosesClient({
  diagnoses,
  usage,
  canManage,
}: {
  diagnoses: Diagnosis[]
  /** จำนวนครั้งที่โรคนั้นถูกบันทึกในใบตรวจรักษา */
  usage: Record<string, number>
  /** หมอ/แอดมินเท่านั้นที่แก้ชื่อ รวม หรือลบได้ — แคชเชียร์ดูอย่างเดียว */
  canManage: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState({ en: '', th: '' })
  const [editing, setEditing] = useState<{ id: string; en: string; th: string } | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [mergeTarget, setMergeTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const shown = searchDiagnoses(diagnoses, query, 500)
  const countOf = (id: string) => usage[id] ?? 0
  const selectedRows = diagnoses.filter((d) => selected.includes(d.id))

  async function addDiagnosis() {
    const name = composeBreed(adding.en, adding.th)
    if (!name) { toast.error('กรอกชื่อโรคอย่างน้อยหนึ่งภาษา'); return }
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('diagnoses').insert({
      name,
      name_en: adding.en.trim() || null,
      name_th: adding.th.trim() || null,
    })
    setBusy(false)
    if (error) { toast.error(error.code === '23505' ? `มีชื่อโรค "${name}" อยู่แล้ว` : 'เพิ่มไม่สำเร็จ'); return }
    toast.success(`เพิ่มชื่อโรค "${name}" แล้ว`)
    setAdding({ en: '', th: '' })
    router.refresh()
  }

  async function saveRename() {
    if (!editing) return
    const name = composeBreed(editing.en, editing.th)
    if (!name) { toast.error('กรอกชื่อโรคอย่างน้อยหนึ่งภาษา'); return }
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('diagnoses')
      .update({ name, name_en: editing.en.trim() || null, name_th: editing.th.trim() || null })
      .eq('id', editing.id)
    setBusy(false)
    if (error) { toast.error(error.code === '23505' ? `มีชื่อโรค "${name}" อยู่แล้ว` : 'แก้ไม่สำเร็จ'); return }
    // แก้ชื่อที่นี่เปลี่ยนทุกใบที่เคยบันทึกโรคนี้ด้วย (ผูกเป็น FK ไม่ได้ copy ชื่อไป)
    toast.success('แก้ชื่อแล้ว — ใบตรวจรักษาที่เคยบันทึกโรคนี้เปลี่ยนตามทั้งหมด')
    setEditing(null)
    router.refresh()
  }

  async function removeDiagnosis(d: Diagnosis) {
    const used = countOf(d.id)
    if (used > 0) {
      toast.error(`"${d.name}" ใช้อยู่ ${used} ใบ — ถ้าซ้ำกับโรคอื่น ให้รวมโรคแทนการลบ`)
      return
    }
    if (!(await confirmDialog({ message: `ลบชื่อโรค "${d.name}" ออกจากรายการ?` })).confirmed) return
    const supabase = createClient()
    const { error } = await supabase.from('diagnoses').delete().eq('id', d.id)
    if (error) { toast.error('ลบไม่สำเร็จ'); return }
    toast.success('ลบแล้ว')
    setSelected((prev) => prev.filter((id) => id !== d.id))
    router.refresh()
  }

  async function runMerge() {
    if (!mergeTarget || selected.length < 2) return
    const target = diagnoses.find((d) => d.id === mergeTarget)
    if (!target) return
    const sources = selected.filter((id) => id !== mergeTarget)
    const sourceNames = diagnoses.filter((d) => sources.includes(d.id)).map((d) => d.name)
    const moving = sources.reduce((sum, id) => sum + countOf(id), 0)

    const ok = await confirmDialog({
      message: `รวม ${sourceNames.map((n) => `"${n}"`).join(' + ')} เข้าเป็น "${target.name}"\n\n`
        + `ใบตรวจรักษา ${moving} ใบจะย้ายไปใช้ชื่อ "${target.name}" แล้วชื่อเดิมถูกลบออกจากรายการ\nย้อนกลับไม่ได้`,
    })
    if (!ok.confirmed) return

    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('merge_diagnoses', { p_target: mergeTarget, p_sources: sources })
    setBusy(false)
    if (error) { toast.error('รวมโรคไม่สำเร็จ'); return }
    toast.success(`รวมเป็น "${target.name}" แล้ว (ย้าย ${data ?? 0} ใบ)`)
    setSelected([])
    setMergeTarget(null)
    router.refresh()
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <HeartPulse size={22} className="text-gray-400" /> ชื่อโรค
        </h1>
        <p className="text-xs text-gray-400 text-right">
          {diagnoses.length} ชื่อ · เลือกไปใช้ในช่อง Assessment / Diagnosis หน้าตรวจรักษา
        </p>
      </div>

      {canManage && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <p className="text-xs font-medium text-gray-600 mb-2">เพิ่มชื่อโรคใหม่</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
            <input
              type="text"
              value={adding.en}
              onChange={(e) => setAdding({ ...adding, en: e.target.value })}
              placeholder="English (เช่น Gingivitis)"
              className={inputClass}
            />
            <input
              type="text"
              value={adding.th}
              onChange={(e) => setAdding({ ...adding, th: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDiagnosis() } }}
              placeholder="ภาษาไทย (เช่น เหงือกอักเสบ)"
              className={inputClass}
            />
            <button
              onClick={addDiagnosis}
              disabled={busy || (!adding.en.trim() && !adding.th.trim())}
              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Plus size={14} /> เพิ่ม
            </button>
          </div>
        </div>
      )}

      {/* แถบรวมโรค — โผล่เมื่อติ๊กตั้งแต่ 2 ชื่อขึ้นไป */}
      {canManage && selected.length >= 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
            <GitMerge size={16} /> รวม {selected.length} ชื่อเป็นชื่อเดียว
          </p>
          <p className="text-xs text-amber-800 mb-3">เลือกชื่อที่จะใช้ต่อ — อีกชื่อจะถูกย้ายมารวมแล้วลบออกจากรายการ</p>
          <div className="space-y-1.5 mb-3">
            {selectedRows.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm text-amber-900">
                <input
                  type="radio"
                  name="merge-target"
                  checked={mergeTarget === d.id}
                  onChange={() => setMergeTarget(d.id)}
                  className="w-4 h-4 accent-amber-600"
                />
                {d.name} <span className="text-xs text-amber-700">({countOf(d.id)} ใบ)</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={runMerge}
              disabled={busy || !mergeTarget}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <GitMerge size={14} /> รวมโรค
            </button>
            <button
              onClick={() => { setSelected([]); setMergeTarget(null) }}
              className="px-4 py-2 border border-amber-300 text-amber-800 rounded-lg text-sm"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อโรค..."
          className={`${inputClass} pl-9`}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
        {shown.map((d) => {
          const isEditing = editing?.id === d.id
          const used = countOf(d.id)
          return (
            <div key={d.id} className="px-4 py-2.5">
              {isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={editing.en}
                    onChange={(e) => setEditing({ ...editing, en: e.target.value })}
                    placeholder="English"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={editing.th}
                    onChange={(e) => setEditing({ ...editing, th: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); saveRename() }
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    placeholder="ภาษาไทย"
                    className={inputClass}
                  />
                  <button onClick={saveRename} disabled={busy} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg">
                    <Check size={14} /> บันทึก
                  </button>
                  <button onClick={() => setEditing(null)} className="p-2 text-gray-400 hover:text-gray-600"><X size={16} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      onChange={(e) => {
                        setSelected((prev) => e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id))
                        if (!e.target.checked && mergeTarget === d.id) setMergeTarget(null)
                      }}
                      title="ติ๊กตั้งแต่ 2 ชื่อเพื่อรวมโรค"
                      className="w-4 h-4 accent-blue-600 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">{d.name}</p>
                    <p className="text-xs text-gray-400">{used > 0 ? `ใช้ใน ${used} ใบตรวจรักษา` : 'ยังไม่เคยใช้'}</p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditing({ id: d.id, en: d.name_en ?? '', th: d.name_th ?? '' })}
                        title="แก้ชื่อ"
                        className="p-1.5 text-gray-300 hover:text-blue-600 rounded"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => removeDiagnosis(d)}
                        title={used > 0 ? 'ใช้อยู่ — รวมโรคแทนการลบ' : 'ลบ'}
                        className="p-1.5 text-gray-300 hover:text-red-600 rounded disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {shown.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            {query ? 'ไม่พบชื่อโรคที่ค้นหา' : 'ยังไม่มีชื่อโรคในระบบ — เพิ่มได้ที่ด้านบน หรือพิมพ์เพิ่มตอนบันทึกการตรวจ'}
          </p>
        )}
      </div>
    </div>
  )
}
