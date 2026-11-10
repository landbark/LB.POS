'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/ProgressLink'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Merge, X, Search, Loader2, AlertTriangle, Check, Users, PawPrint } from 'lucide-react'
import { useLookup } from '@/lib/use-lookup'
import { confirmDialog } from '@/lib/confirm'
import { COUNT_LABELS, COUNT_TABLES, type MergeKind } from '@/lib/merge'
import { SPECIES_LABELS, type PetSpecies } from '@/lib/types'

export interface DupRow {
  id: string
  hn: string | null
  name: string
  /** บรรทัดรอง — ลูกค้า = เบอร์โทร, สัตว์ = ชื่อเจ้าของ */
  sub: string
  extra: string
}

export interface DupGroup {
  reasons: string[]
  rows: DupRow[]
}

export interface MergeLogRow {
  id: string
  /** 'visit' = ย้ายใบตรวจที่ลงผิดตัว (ไม่ได้ลบอะไร) ทำจากหน้าเวชระเบียน */
  kind: MergeKind | 'visit'
  kept_id: string
  kept_hn: string | null
  kept_name: string | null
  merged_hn: string | null
  merged_name: string | null
  merged_phone: string | null
  moved: Record<string, number>
  created_at: string
}

/** แถวที่ดึงรายละเอียดมาเทียบกัน (คอลัมน์ไหนมีบ้างขึ้นกับ kind) */
interface Detail {
  id: string
  hn: string | null
  name: string
  counts: Record<string, number>
  customers?: { id: string; name: string; phone: string; hn: string | null } | null
  [key: string]: unknown
}

interface FieldSpec {
  key: string
  label: string
  show: (r: Detail) => string
  /** ค่านี้ถือว่า "มีข้อมูล" ไหม — ใช้ตั้งค่าเริ่มต้นว่าจะเอาของใบไหน */
  filled?: (r: Detail) => boolean
}

const thaiDate = (v: unknown) =>
  typeof v === 'string' && v
    ? new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '—')

const CUSTOMER_FIELDS: FieldSpec[] = [
  { key: 'name', label: 'ชื่อ', show: (r) => text(r.name) },
  { key: 'last_name', label: 'นามสกุล', show: (r) => text(r.last_name) },
  { key: 'phone', label: 'เบอร์โทร', show: (r) => text(r.phone) },
  { key: 'hn', label: 'HN', show: (r) => text(r.hn) },
  { key: 'address', label: 'ที่อยู่', show: (r) => text(r.address) },
]

const PET_FIELDS: FieldSpec[] = [
  { key: 'customer_id', label: 'เจ้าของ', show: (r) => r.customers?.name ?? '—', filled: (r) => !!r.customers },
  { key: 'name', label: 'ชื่อ', show: (r) => text(r.name) },
  { key: 'species', label: 'ชนิด', show: (r) => SPECIES_LABELS[r.species as PetSpecies] ?? '—' },
  { key: 'breed', label: 'พันธุ์', show: (r) => text(r.breed) },
  {
    key: 'sex',
    label: 'เพศ',
    show: (r) => (r.sex === 'male' ? 'เพศผู้' : r.sex === 'female' ? 'เพศเมีย' : '—'),
  },
  { key: 'birth_date', label: 'วันเกิด', show: (r) => thaiDate(r.birth_date) },
  { key: 'color', label: 'สี', show: (r) => text(r.color) },
  { key: 'microchip', label: 'ไมโครชิป', show: (r) => text(r.microchip) },
  {
    key: 'sterilized',
    label: 'ทำหมัน',
    show: (r) => (r.sterilized ? 'ทำแล้ว' : 'ยังไม่ทำ'),
    filled: (r) => r.sterilized === true,
  },
  { key: 'sterilized_date', label: 'วันที่ทำหมัน', show: (r) => thaiDate(r.sterilized_date) },
  { key: 'allergies', label: 'แพ้ยา/อาหาร', show: (r) => text(r.allergies) },
  { key: 'chronic_conditions', label: 'โรคประจำตัว', show: (r) => text(r.chronic_conditions) },
  { key: 'notes', label: 'หมายเหตุ', show: (r) => text(r.notes) },
]

/** ค่าเริ่มต้น: ของใบที่เก็บไว้ก่อน ถ้าว่างค่อยหยิบของใบอื่นมาเติม */
function defaultPicks(fields: FieldSpec[], records: Detail[], keepId: string) {
  const ordered = [...records].sort((a, b) => Number(b.id === keepId) - Number(a.id === keepId))
  const picks: Record<string, string> = {}

  for (const f of fields) {
    const filled = f.filled ?? ((r: Detail) => f.show(r) !== '—')
    picks[f.key] = (ordered.find(filled) ?? ordered[0]).id
  }
  return picks
}

const sumCounts = (records: Detail[]) => {
  const total: Record<string, number> = {}
  for (const r of records) {
    for (const [table, n] of Object.entries(r.counts ?? {})) total[table] = (total[table] ?? 0) + n
  }
  return total
}

export default function MergeClient({
  customerGroups,
  petGroups,
  log,
  initialKind,
  initialIds,
  totals,
}: {
  customerGroups: DupGroup[]
  petGroups: DupGroup[]
  log: MergeLogRow[]
  initialKind: MergeKind
  initialIds: string[]
  totals: { customers: number; pets: number }
}) {
  const router = useRouter()
  const [kind, setKind] = useState<MergeKind>(initialKind)
  const [ids, setIds] = useState<string[]>(initialIds)
  // เก็บผลที่โหลดมาพร้อม "กุญแจ" ของมัน — กำลังโหลด = ของที่ถืออยู่ยังไม่ใช่ของชุดที่เลือก
  // (แพทเทิร์นเดียวกับ use-lookup เพื่อไม่ต้อง setState ตรง ๆ ในบอดี้ของ effect)
  const [loaded, setLoaded] = useState<{ key: string; rows: Detail[] }>({ key: '', rows: [] })
  const [keepId, setKeepId] = useState<string>('')
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')

  const fields = kind === 'customer' ? CUSTOMER_FIELDS : PET_FIELDS
  const groups = kind === 'customer' ? customerGroups : petGroups

  const key = `${kind}:${ids.join(',')}`
  const records = loaded.key === key ? loaded.rows : []
  const loading = ids.length > 0 && loaded.key !== key

  const { results, loading: searching } = useLookup<{
    id: string
    name: string
    phone?: string
    hn?: string | null
    customers?: { name: string } | null
  }>(kind === 'customer' ? 'customers' : 'pets', query)

  // โหลดรายละเอียดของใบที่เลือกไว้ (พร้อมจำนวนประวัติที่จะถูกย้าย)
  useEffect(() => {
    if (ids.length === 0) return
    let cancelled = false

    ;(async () => {
      const res = await fetch(`/api/admin/merge?kind=${kind}&ids=${ids.join(',')}`)
      const data = await res.json().catch(() => ({}))
      if (cancelled) return

      if (!res.ok) {
        toast.error(data.error ?? 'โหลดข้อมูลไม่สำเร็จ')
        return
      }

      const rows: Detail[] = data.records ?? []

      // ค่าเริ่มต้น "เก็บใบไหน": ใบที่มีประวัติมากสุด (ย้ายน้อยที่สุด) เท่ากันเอาใบเก่ากว่า
      const best = [...rows].sort((a, b) => {
        const an = Object.values(a.counts ?? {}).reduce((s, n) => s + n, 0)
        const bn = Object.values(b.counts ?? {}).reduce((s, n) => s + n, 0)
        if (an !== bn) return bn - an
        return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
      })[0]

      const keep = best?.id ?? ''
      setLoaded({ key, rows })
      setKeepId(keep)
      setPicks(defaultPicks(kind === 'customer' ? CUSTOMER_FIELDS : PET_FIELDS, rows, keep))
    })()

    return () => { cancelled = true }
  }, [key, kind, ids])

  function switchKind(next: MergeKind) {
    setKind(next)
    setIds([])
  }

  function add(id: string) {
    setQuery('')
    setIds((prev) => (prev.includes(id) || prev.length >= 5 ? prev : [...prev, id]))
  }

  function pickKeep(id: string) {
    setKeepId(id)
    setPicks(defaultPicks(fields, records, id))
  }

  async function submit() {
    const keep = records.find((r) => r.id === keepId)
    const others = records.filter((r) => r.id !== keepId)
    if (!keep || others.length === 0) return

    const moved = sumCounts(others)
    const movedText = Object.entries(moved)
      .map(([table, n]) => `${COUNT_LABELS[table] ?? table} ${n}`)
      .join(' · ')

    const what = kind === 'customer' ? 'เจ้าของสัตว์' : 'สัตว์เลี้ยง'
    const confirmed = await confirmDialog({
      title: `รวม${what} ${others.length + 1} รายการเป็นรายการเดียว`,
      message:
        `เก็บไว้: ${keep.hn ? keep.hn + ' ' : ''}${keep.name}\n` +
        `จะถูกลบ: ${others.map((r) => `${r.hn ? r.hn + ' ' : ''}${r.name}`).join(', ')}\n\n` +
        (movedText ? `ย้ายมาอยู่กับรายการที่เก็บไว้: ${movedText}\n\n` : '') +
        'ย้อนกลับเองไม่ได้ (ข้อมูลเดิมถูกบันทึกไว้ในประวัติการรวม ค้นด้วย HN เก่าได้)',
      confirmLabel: 'รวมเลย',
      tone: 'danger',
    })
    if (!confirmed.confirmed) return

    // ส่งค่าที่เลือกไว้ทั้งชุด — เห็นอะไรในตารางก็ได้อย่างนั้น
    const overrides: Record<string, unknown> = {}
    for (const f of fields) {
      const from = records.find((r) => r.id === picks[f.key])
      if (!from) continue
      const value = from[f.key]
      overrides[f.key] = typeof value === 'string' && value.trim() === '' ? null : value ?? null
    }

    setSaving(true)
    const res = await fetch('/api/admin/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, keep: keepId, merge: others.map((r) => r.id), overrides }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      toast.error(data.error ?? 'รวมไม่สำเร็จ')
      return
    }

    toast.success('รวมแล้ว — เหลือรายการเดียว')
    setIds([])
    router.refresh()
  }

  const inputClass =
    'w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const others = records.filter((r) => r.id !== keepId)
  const movedTotals = sumCounts(others)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">รวมข้อมูลซ้ำ</h1>
        <p className="text-sm text-gray-500 mt-1">
          เจ้าของคนเดิมหรือสัตว์ตัวเดิมที่ถูกลงทะเบียนซ้ำหลายใบ — รวมให้เหลือใบเดียว
          ประวัติตรวจรักษา วัคซีน นัดหมาย และบิลขายย้ายไปอยู่กับใบที่เก็บไว้ทั้งหมด
        </p>
      </div>

      <div className="flex gap-2 mb-5">
        {([
          { key: 'customer' as MergeKind, label: 'เจ้าของสัตว์ / ลูกค้า', icon: Users, n: customerGroups.length },
          { key: 'pet' as MergeKind, label: 'สัตว์เลี้ยง', icon: PawPrint, n: petGroups.length },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => switchKind(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              kind === t.key
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <t.icon size={15} /> {t.label}
            {t.n > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${kind === t.key ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>
                {t.n}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* เลือกรายการเอง */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-5">
        <label className="block text-xs font-medium text-gray-600 mb-2">
          เลือกรายการที่จะรวม (เลือกได้ถึง 5 รายการ)
        </label>
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={kind === 'customer' ? 'ค้นหา HN / ชื่อ / เบอร์โทร...' : 'ค้นหา HN / ชื่อสัตว์ / ชื่อเจ้าของ...'}
            className={inputClass}
          />
          {searching && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
        </div>

        {query.trim() && !searching && (
          <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-w-md overflow-hidden">
            {results.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">ไม่พบรายการ</p>}
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => add(r.id)}
                disabled={ids.includes(r.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 flex items-center gap-2"
              >
                <span className="font-mono text-xs text-gray-400">{r.hn ?? '—'}</span>
                <span className="font-medium text-gray-800">{r.name}</span>
                <span className="text-gray-500 text-xs">{r.customers?.name ?? r.phone ?? ''}</span>
              </button>
            ))}
          </div>
        )}

        {ids.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {records.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                {r.hn ?? ''} {r.name}
                <button onClick={() => setIds((prev) => prev.filter((id) => id !== r.id))} className="text-gray-400 hover:text-red-600">
                  <X size={12} />
                </button>
              </span>
            ))}
            <button onClick={() => setIds([])} className="text-xs text-gray-400 hover:text-gray-600 underline">
              ล้างทั้งหมด
            </button>
          </div>
        )}
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-gray-500 mb-5">
          <Loader2 size={15} className="animate-spin" /> กำลังโหลดรายละเอียด...
        </p>
      )}

      {/* ตารางเปรียบเทียบ */}
      {records.length >= 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 w-40">เก็บไว้ใบไหน</th>
                  {records.map((r) => (
                    <th key={r.id} className={`px-4 py-3 text-left ${r.id === keepId ? 'bg-blue-50' : ''}`}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={r.id === keepId}
                          onChange={() => pickKeep(r.id)}
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-mono text-xs text-gray-400">{r.hn ?? '—'}</span>
                          <span className="block font-semibold text-gray-900">{r.name}</span>
                          <span className="block text-xs text-gray-500">
                            {Object.entries(r.counts ?? {}).length === 0
                              ? 'ไม่มีประวัติ'
                              : Object.entries(r.counts).map(([t, n]) => `${COUNT_LABELS[t] ?? t} ${n}`).join(' · ')}
                          </span>
                        </span>
                      </label>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fields.map((f) => {
                  const values = records.map((r) => f.show(r))
                  const same = values.every((v) => v === values[0])
                  return (
                    <tr key={f.key} className={same ? '' : 'bg-amber-50/40'}>
                      <td className="px-4 py-2.5 text-xs font-medium text-gray-500 align-top">
                        {f.label}
                        {!same && <span className="block text-[10px] text-amber-600 font-normal">เลือกค่าที่จะเก็บ</span>}
                      </td>
                      {records.map((r, i) => (
                        <td key={r.id} className={`px-4 py-2.5 align-top ${r.id === keepId ? 'bg-blue-50/40' : ''}`}>
                          {same ? (
                            <span className="text-gray-700">{values[i]}</span>
                          ) : (
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`pick-${f.key}`}
                                checked={picks[f.key] === r.id}
                                onChange={() => setPicks((prev) => ({ ...prev, [f.key]: r.id }))}
                                className="mt-1"
                              />
                              <span className={picks[f.key] === r.id ? 'text-gray-900 font-medium' : 'text-gray-500'}>
                                {values[i]}
                              </span>
                            </label>
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {kind === 'customer' && (
                  <tr className="bg-gray-50/60">
                    <td className="px-4 py-2.5 text-xs font-medium text-gray-500">แต้ม / เครดิต / ยอดซื้อ</td>
                    <td colSpan={records.length} className="px-4 py-2.5 text-gray-700">
                      บวกรวมทุกใบอัตโนมัติ —{' '}
                      <span className="font-semibold text-blue-600">
                        {records.reduce((s, r) => s + Number(r.points ?? 0), 0).toLocaleString('th-TH')} แต้ม
                      </span>{' '}
                      ·{' '}
                      <span className="font-semibold text-green-600">
                        เครดิต ฿{records.reduce((s, r) => s + Number(r.credit_balance ?? 0), 0).toLocaleString('th-TH')}
                      </span>{' '}
                      ·{' '}
                      <span className="font-semibold">
                        ยอดซื้อ ฿{records.reduce((s, r) => s + Number(r.total_spent ?? 0), 0).toLocaleString('th-TH')}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-100 p-4 bg-gray-50/50">
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  {others.length} รายการจะถูกลบ และข้อมูลที่ผูกไว้ย้ายไปอยู่กับใบที่เก็บไว้
                </p>
                <p className="text-xs mt-0.5">
                  {Object.keys(movedTotals).length === 0
                    ? 'ใบที่จะลบไม่มีประวัติผูกอยู่'
                    : COUNT_TABLES[kind]
                        .filter((t) => movedTotals[t.table])
                        .map((t) => `${t.label} ${movedTotals[t.table]} รายการ`)
                        .join(' · ')}
                  {kind === 'pet' && ' · HN เดิมของสัตว์ที่ถูกรวมจะค้นเจอในประวัติการรวม'}
                </p>
              </div>
            </div>
            <button
              onClick={submit}
              disabled={saving || !keepId || others.length === 0}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Merge size={15} />}
              {saving ? 'กำลังรวม...' : 'รวมข้อมูล'}
            </button>
          </div>
        </div>
      )}

      {/* คู่ที่น่าจะซ้ำ */}
      {records.length < 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              คู่ที่น่าจะซ้ำ {groups.length > 0 && <span className="text-gray-400 font-normal">({groups.length} กลุ่ม)</span>}
            </h2>
            <span className="text-xs text-gray-400">
              ตรวจจาก {kind === 'customer' ? `ลูกค้า ${totals.customers} ราย` : `สัตว์ ${totals.pets} ตัว`}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {groups.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-gray-400">
                ไม่พบรายการที่น่าจะซ้ำ — ถ้ารู้คู่ที่ซ้ำอยู่แล้ว ค้นหาเลือกเองได้ด้านบน
              </p>
            )}
            {groups.map((g) => (
              <div key={g.rows.map((r) => r.id).join('-')} className="px-4 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-amber-700 mb-1">{g.reasons.join(' · ')}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {g.rows.map((r) => (
                      <span key={r.id} className="text-sm">
                        <span className="font-mono text-xs text-gray-400 mr-1">{r.hn ?? '—'}</span>
                        <span className="font-medium text-gray-900">{r.name}</span>
                        <span className="text-gray-500 text-xs ml-1">{r.sub}</span>
                        {r.extra && <span className="text-gray-400 text-xs ml-1">· {r.extra}</span>}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setIds(g.rows.map((r) => r.id).slice(0, 5))}
                  className="shrink-0 flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-600 text-xs font-medium px-3 py-1.5 rounded-lg"
                >
                  <Merge size={13} /> เทียบ / รวม
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ประวัติการรวม */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">ประวัติการรวมและการย้าย</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            ค้นหาด้วย HN หรือเบอร์เดิมที่หน้าลูกค้า/สัตว์เลี้ยง ก็เจอใบที่เก็บไว้ · รวมใบตรวจที่ย้ายเพราะลงผิดตัวด้วย
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {log.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">ยังไม่เคยรวมหรือย้ายข้อมูล</p>}
          {log.map((row) => (
            <div key={row.id} className="px-4 py-2.5 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs text-gray-400 w-24 shrink-0">
                {new Date(row.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
              </span>
              <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                {row.kind === 'pet' ? 'สัตว์' : row.kind === 'visit' ? 'ย้ายใบตรวจ' : 'ลูกค้า'}
              </span>
              {row.kind === 'visit' ? (
                <>
                  <Link href={`/admin/visits/${row.kept_id}`} className="font-mono font-medium text-gray-900 hover:text-blue-600">
                    {row.kept_name ?? 'ใบตรวจ'}
                  </Link>
                  <span className="text-gray-400">
                    ย้ายจาก {[row.merged_hn, row.merged_name].filter(Boolean).join(' ')} → {row.kept_hn ?? '—'}
                  </span>
                </>
              ) : (
                <>
                  <span className="line-through text-gray-400">
                    {[row.merged_hn, row.merged_name, row.merged_phone].filter(Boolean).join(' · ')}
                  </span>
                  <span className="text-gray-400">→</span>
                  <Link
                    href={row.kind === 'pet' ? `/admin/pets/${row.kept_id}` : `/admin/customers/${row.kept_id}`}
                    className="font-medium text-gray-900 hover:text-blue-600"
                  >
                    {[row.kept_hn, row.kept_name].filter(Boolean).join(' · ') || 'ดูรายการที่เก็บไว้'}
                  </Link>
                </>
              )}
              {Object.keys(row.moved ?? {}).length > 0 && (
                <span className="text-xs text-gray-400">
                  (ย้าย {Object.entries(row.moved).map(([t, n]) => `${COUNT_LABELS[t] ?? t} ${n}`).join(' · ')})
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-4">
        <Check size={12} /> การรวมทำในทรานแซคชันเดียวที่ฐานข้อมูล ถ้าพลาดกลางทางจะไม่มีข้อมูลค้างครึ่ง ๆ กลาง ๆ
      </p>
    </div>
  )
}
