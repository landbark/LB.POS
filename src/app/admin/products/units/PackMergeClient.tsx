'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, Search, Loader2, AlertTriangle, Boxes } from 'lucide-react'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/lib/confirm'

export interface BaseInfo {
  id: string
  sku: string
  name: string
  unit: string
  price: number
  cost: number | null
  stock: number
}

export interface MergeCandidate {
  packId: string
  packSku: string
  packName: string
  packUnit: string
  packPrice: number
  packCost: number | null
  packStock: number
  base: BaseInfo | null
  suggestedFactor: number
  sellablePos: boolean
}

export interface MergedRow {
  id: string
  sku: string | null
  unitName: string
  factor: number
  price: number | null
  cost: number | null
  sellablePos: boolean
  purchasable: boolean
  active: boolean
  productName: string
  baseUnit: string
  basePrice: number
}

interface Draft {
  unitName: string
  factor: string
  price: string
  cost: string
  sellablePos: boolean
  purchasable: boolean
  base: BaseInfo | null
  /** ช่องกรอก SKU ฐานเอง (เฉพาะแถวที่ระบบหาตัวฐานไม่เจอ) */
  baseSkuInput: string
}

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inputClass =
  'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

/** ทุนเริ่มต้นของแพ็ก — ข้อมูลเก่าบางตัวกรอกทุนต่อชิ้นไว้ในช่องทุนกล่อง ซึ่งใช้ต่อไม่ได้ */
function initialCost(c: MergeCandidate, factor: number): string {
  const base = c.base
  if (c.packCost != null && (!base?.cost || c.packCost >= base.cost * 1.5)) return String(c.packCost)
  if (base?.cost) return (base.cost * factor).toFixed(2)
  return c.packCost != null ? String(c.packCost) : ''
}

function makeDraft(c: MergeCandidate): Draft {
  const factor = c.suggestedFactor || 0
  return {
    unitName: c.packUnit,
    factor: factor ? String(factor) : '',
    price: String(c.packPrice),
    cost: initialCost(c, factor),
    sellablePos: c.sellablePos,
    purchasable: true,
    base: c.base,
    baseSkuInput: '',
  }
}

export default function PackMergeClient({
  candidates,
  orphans,
  merged,
  userId,
}: {
  candidates: MergeCandidate[]
  orphans: MergeCandidate[]
  merged: MergedRow[]
  userId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const all = useMemo(() => [...candidates, ...orphans], [candidates, orphans])

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(all.map((c) => [c.packId, makeDraft(c)])),
  )
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<'todo' | 'done'>(candidates.length > 0 ? 'todo' : 'done')
  const [search, setSearch] = useState('')

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  const q = search.trim().toLowerCase()
  const visible = all.filter(
    (c) => !q || c.packSku.toLowerCase().includes(q) || c.packName.toLowerCase().includes(q),
  )
  const selectedIds = Object.keys(selected).filter((id) => selected[id])

  async function resolveBase(c: MergeCandidate) {
    const sku = drafts[c.packId].baseSkuInput.trim()
    if (!sku) return
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, name, unit, price, cost, replaced_by_unit_id, product_lots(quantity)')
      .eq('sku', sku)
      .maybeSingle()
    if (error || !data) {
      toast.error(`ไม่พบสินค้า SKU ${sku}`)
      return
    }
    if (data.replaced_by_unit_id) {
      toast.error(`${sku} เป็นตัวที่ถูกยุบไปแล้ว เลือกตัวอื่น`)
      return
    }
    const base: BaseInfo = {
      id: data.id,
      sku: data.sku ?? '',
      name: data.name,
      unit: data.unit,
      price: data.price,
      cost: data.cost,
      stock: ((data.product_lots ?? []) as { quantity: number }[]).reduce((s, l) => s + l.quantity, 0),
    }
    setDraft(c.packId, { base })
    toast.success(`ผูกกับ ${base.name}`)
  }

  /** ยุบหนึ่งแถว — คืน true เมื่อสำเร็จ */
  async function mergeOne(c: MergeCandidate): Promise<boolean> {
    const d = drafts[c.packId]
    const factor = parseInt(d.factor)
    if (!d.base) {
      toast.error(`${c.packSku}: ยังไม่ได้เลือกสินค้าฐาน`)
      return false
    }
    if (!factor || factor < 2) {
      toast.error(`${c.packSku}: ตัวคูณต้องเป็นจำนวนเต็มตั้งแต่ 2 ขึ้นไป`)
      return false
    }
    if (!d.unitName.trim()) {
      toast.error(`${c.packSku}: ยังไม่ได้ตั้งชื่อหน่วย`)
      return false
    }
    const { error } = await supabase.rpc('merge_pack_product', {
      p_pack_product_id: c.packId,
      p_base_product_id: d.base.id,
      p_unit_name: d.unitName.trim(),
      p_factor: factor,
      p_price: d.price === '' ? null : parseFloat(d.price),
      p_cost: d.cost === '' ? null : parseFloat(d.cost),
      p_sellable_pos: d.sellablePos,
      p_purchasable: d.purchasable,
      p_created_by: userId || null,
    })
    if (error) {
      toast.error(`${c.packSku}: ${error.message}`)
      return false
    }
    return true
  }

  async function handleMerge(c: MergeCandidate) {
    const d = drafts[c.packId]
    const factor = parseInt(d.factor) || 0
    const moved = c.packStock * factor
    const { confirmed } = await confirmDialog({
      title: `ยุบ ${c.packSku} เป็น "${d.unitName}" ของ ${d.base?.sku ?? '—'}`,
      message:
        `1 ${d.unitName} = ${factor} ${d.base?.unit ?? ''}` +
        (c.packStock !== 0
          ? `\nสต็อค ${c.packStock} ${d.unitName} → ย้ายไปเป็น ${moved} ${d.base?.unit ?? ''} ของตัวฐาน`
          : '\nไม่มีสต็อคค้างให้ย้าย') +
        `\n\nย้อนคืนเองไม่ได้ — ถ้าตัวคูณผิดต้องไปปรับสต็อคที่หน้าสต็อคทีหลัง`,
      confirmLabel: 'ยุบรวม',
    })
    if (!confirmed) return
    setBusy(c.packId)
    const ok = await mergeOne(c)
    setBusy(null)
    if (ok) {
      toast.success(`ยุบ ${c.packSku} แล้ว`)
      router.refresh()
    }
  }

  async function handleMergeSelected() {
    const rows = all.filter((c) => selected[c.packId])
    if (rows.length === 0) return
    const { confirmed } = await confirmDialog({
      title: `ยุบ ${rows.length} รายการที่เลือก`,
      message: 'ใช้ตัวคูณ/ราคา/ทุนตามที่กรอกไว้ในแต่ละแถว — ย้อนคืนเองไม่ได้',
      confirmLabel: `ยุบ ${rows.length} รายการ`,
    })
    if (!confirmed) return
    setBusy('bulk')
    let done = 0
    for (const c of rows) {
      // ทำทีละแถว ไม่ขนาน — ล้มแถวไหนก็รู้ว่าแถวไหน และยอดสต็อคไม่ชนกันเอง
      if (await mergeOne(c)) {
        done++
        setSelected((s) => ({ ...s, [c.packId]: false }))
      }
    }
    setBusy(null)
    toast[done === rows.length ? 'success' : 'error'](`ยุบสำเร็จ ${done}/${rows.length} รายการ`)
    router.refresh()
  }

  async function updateUnit(u: MergedRow, patch: Record<string, unknown>) {
    const { error } = await supabase.from('product_units').update(patch).eq('id', u.id)
    if (error) toast.error(error.message)
    else {
      toast.success('บันทึกแล้ว')
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTab('todo')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'todo' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          รอยุบ {all.length}
        </button>
        <button
          onClick={() => setTab('done')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'done' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          หน่วยที่ใช้อยู่ {merged.length}
        </button>
      </div>

      {tab === 'todo' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหา SKU / ชื่อสินค้า"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleMergeSelected}
              disabled={selectedIds.length === 0 || busy !== null}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {busy === 'bulk' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              ยุบที่เลือก ({selectedIds.length})
            </button>
          </div>

          {all.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
              <Boxes size={32} className="mx-auto mb-2 text-gray-300" />
              ไม่มีสินค้าแพ็กที่ยังไม่ได้ยุบ
            </div>
          )}

          <div className="space-y-3">
            {visible.map((c) => {
              const d = drafts[c.packId]
              const factor = parseInt(d.factor) || 0
              const price = parseFloat(d.price) || 0
              const cost = d.cost === '' ? null : parseFloat(d.cost)
              const base = d.base
              const fullPrice = base ? base.price * factor : 0
              const discountPct = fullPrice > 0 && price > 0 ? ((fullPrice - price) / fullPrice) * 100 : 0
              const costPerBase = cost != null && factor > 0 ? cost / factor : null
              const costRatio = c.packCost && base?.cost ? c.packCost / base.cost : null
              const priceRatio = base && base.price > 0 ? c.packPrice / base.price : null

              return (
                <div key={c.packId} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[c.packId])}
                      onChange={(e) => setSelected((s) => ({ ...s, [c.packId]: e.target.checked }))}
                      className="mt-1 w-4 h-4"
                      disabled={!base}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{c.packSku}</span>
                        <span className="text-sm font-medium text-gray-900 truncate">{c.packName}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ขาย ฿{money(c.packPrice)} · ทุน {c.packCost != null ? `฿${money(c.packCost)}` : '—'} ·
                        สต็อคค้าง {c.packStock} {c.packUnit}
                      </p>
                    </div>
                  </div>

                  {base ? (
                    <p className="text-xs text-gray-600 mb-3 bg-gray-50 rounded-lg px-3 py-2">
                      ตัวฐาน <span className="font-mono">{base.sku}</span> · {base.name} ·
                      ขาย ฿{money(base.price)}/{base.unit} ·
                      ทุน {base.cost != null ? `฿${money(base.cost)}` : '—'} ·
                      สต็อค {base.stock} {base.unit}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                      <span className="text-xs text-amber-700">ไม่พบตัวฐาน — กรอก SKU ของหน่วยย่อยเอง</span>
                      <input
                        value={d.baseSkuInput}
                        onChange={(e) => setDraft(c.packId, { baseSkuInput: e.target.value })}
                        placeholder="SKU ฐาน"
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-32"
                      />
                      <button
                        onClick={() => resolveBase(c)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1"
                      >
                        ค้นหา
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <label className="block">
                      <span className="text-xs text-gray-500">ชื่อหน่วย</span>
                      <input value={d.unitName} onChange={(e) => setDraft(c.packId, { unitName: e.target.value })} className={inputClass} />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500">
                        1 {d.unitName || 'หน่วย'} = กี่ {base?.unit ?? 'หน่วยฐาน'}
                      </span>
                      <input
                        type="number" min="2" step="1" value={d.factor}
                        onChange={(e) => setDraft(c.packId, { factor: e.target.value })}
                        className={inputClass}
                      />
                      <span className="text-[11px] text-gray-400 block mt-0.5">
                        เดาจาก{costRatio && costRatio >= 1.5 ? `ทุน ${costRatio.toFixed(2)}` : 'ราคา'}
                        {priceRatio ? ` · ราคา ${priceRatio.toFixed(2)}` : ''}
                      </span>
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500">ราคายก{d.unitName || 'แพ็ก'}</span>
                      <input
                        type="number" min="0" step="0.01" value={d.price}
                        onChange={(e) => setDraft(c.packId, { price: e.target.value })}
                        className={inputClass}
                      />
                      <span className={`text-[11px] block mt-0.5 ${discountPct < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {factor > 0 && base
                          ? discountPct >= 0
                            ? `ลด ${discountPct.toFixed(1)}% จาก ฿${money(fullPrice)}`
                            : `แพงกว่าซื้อแยก ${Math.abs(discountPct).toFixed(1)}%`
                          : ''}
                      </span>
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500">ทุนต่อ{d.unitName || 'แพ็ก'}</span>
                      <input
                        type="number" min="0" step="0.01" value={d.cost}
                        onChange={(e) => setDraft(c.packId, { cost: e.target.value })}
                        className={inputClass}
                      />
                      <span className="text-[11px] text-gray-400 block mt-0.5">
                        {costPerBase != null ? `= ฿${money(costPerBase)}/${base?.unit ?? ''}` : ''}
                      </span>
                    </label>
                    <div className="space-y-1.5 pt-4">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox" checked={d.sellablePos}
                          onChange={(e) => setDraft(c.packId, { sellablePos: e.target.checked })}
                          className="w-4 h-4"
                        />
                        โชว์หน้าขาย
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox" checked={d.purchasable}
                          onChange={(e) => setDraft(c.packId, { purchasable: e.target.checked })}
                          className="w-4 h-4"
                        />
                        ใช้สั่งของ
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-500">
                      {base && factor > 0 && c.packStock !== 0
                        ? `ย้ายสต็อค ${c.packStock} × ${factor} = ${c.packStock * factor} ${base.unit} ไปรวมกับตัวฐาน`
                        : 'ไม่มีสต็อคค้างให้ย้าย'}
                    </span>
                    <button
                      onClick={() => handleMerge(c)}
                      disabled={!base || busy !== null}
                      className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                    >
                      {busy === c.packId ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      ยุบรวม
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'done' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">สินค้า</th>
                <th className="text-left px-3 py-2 font-medium">SKU แพ็ก</th>
                <th className="text-left px-3 py-2 font-medium">หน่วย</th>
                <th className="text-right px-3 py-2 font-medium">ตัวคูณ</th>
                <th className="text-right px-3 py-2 font-medium">ราคา</th>
                <th className="text-right px-3 py-2 font-medium">ลด</th>
                <th className="text-center px-3 py-2 font-medium">หน้าขาย</th>
                <th className="text-center px-3 py-2 font-medium">สั่งของ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {merged.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">ยังไม่มีหน่วยแพ็กในระบบ</td></tr>
              )}
              {merged.map((u) => {
                const full = u.basePrice * u.factor
                const price = u.price ?? full
                const pct = full > 0 ? ((full - price) / full) * 100 : 0
                return (
                  <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                    <td className="px-4 py-2 text-gray-900">{u.productName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{u.sku ?? '—'}</td>
                    <td className="px-3 py-2">{u.unitName}</td>
                    <td className="px-3 py-2 text-right">{u.factor} {u.baseUnit}</td>
                    <td className="px-3 py-2 text-right">฿{money(price)}</td>
                    <td className={`px-3 py-2 text-right ${pct < 0 ? 'text-red-500' : 'text-gray-500'}`}>{pct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox" checked={u.sellablePos}
                        onChange={(e) => updateUnit(u, { sellable_pos: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox" checked={u.purchasable}
                        onChange={(e) => updateUnit(u, { purchasable: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
