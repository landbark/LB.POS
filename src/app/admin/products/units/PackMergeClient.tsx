'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, Search, Loader2, AlertTriangle, Boxes, ArrowLeftRight, PackagePlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/lib/confirm'
import { suggestFactor, guessPackUnitName, packIsPosHidden, discountLooksOff } from '@/lib/packGuess'

export interface Side {
  id: string
  sku: string
  name: string
  unit: string
  price: number
  cost: number | null
  stock: number
  /** จำนวนต่อแพ็กที่อ่านได้จากชื่อสินค้า เช่น (15Gx40) */
  nameHint: number | null
}

export interface NewBaseSeed {
  name: string
  unit: string
  categoryId: string | null
  supplierId: string | null
  vatApplicable: boolean | null
  clinicOnly: boolean | null
}

export interface MergeCandidate {
  key: string
  /** รหัส 6 ตัวหน้า — ใช้เป็น SKU ของสินค้าฐานที่สร้างใหม่ */
  baseCode: string
  /** ตัวที่จะถูกยุบ (หน่วยใหญ่) */
  pack: Side
  /** ตัวที่เป็นหน่วยย่อย (null = ไม่มีคู่ในระบบ) */
  base: Side | null
  suggestedFactor: number
  suggestedUnitName: string
  sellablePos: boolean
  newBase: NewBaseSeed
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
  /** ย้ายสต็อคของตัวแพ็ก (× ตัวคูณ) มารวมกับหน่วยย่อยไหม — ปกติไม่ย้าย ยอดที่ย้ายระบบมานับซ้ำกันอยู่ */
  moveStock: boolean
  /** สลับว่าตัวไหนเป็นหน่วยย่อย */
  swapped: boolean
  /** ตัวฐานที่หามาเองด้วย SKU (แถวที่ไม่มีคู่) */
  foundBase: Side | null
  baseSkuInput: string
  /** เปิดฟอร์มสร้างสินค้าฐานใหม่ */
  creating: boolean
  newName: string
  newUnit: string
  newPrice: string
  newCost: string
}

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inputClass =
  'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

/**
 * ราคาเริ่มต้นของแพ็ก — บางตัวในข้อมูลเก่าไม่เคยตั้งราคาแพ็กไว้ (ติดราคาหน่วยย่อยค้างอยู่
 * เช่น NEZ011B กล่อง ฿15 เท่ากับราคาซอง) ตั้งต้นเป็น "ไม่ลด" ให้ แล้วให้คนแก้
 */
function initialPrice(pack: Side, base: Side | null, factor: number): string {
  if (base && factor > 1 && pack.price <= base.price) return (base.price * factor).toFixed(2)
  return String(pack.price)
}

/** ทุนเริ่มต้นของแพ็ก — ข้อมูลเก่าบางตัวกรอกทุนต่อชิ้นไว้ในช่องทุนกล่อง ซึ่งใช้ต่อไม่ได้ */
function initialCost(pack: Side, base: Side | null, factor: number): string {
  if (pack.cost != null && (!base?.cost || pack.cost >= base.cost * 1.5)) return String(pack.cost)
  if (base?.cost) return (base.cost * factor).toFixed(2)
  return pack.cost != null ? String(pack.cost) : ''
}

function makeDraft(
  c: MergeCandidate,
  swapped = false,
  foundBase: Side | null = null,
  moveStock = false,
  keep?: Partial<Draft>,
): Draft {
  const pack = swapped ? (c.base ?? foundBase ?? c.pack) : c.pack
  const base = swapped ? c.pack : (c.base ?? foundBase)
  const factor = base ? suggestFactor(pack, base, pack.nameHint) : 0
  const unitName = guessPackUnitName(pack.unit, pack.sku)
  return {
    unitName,
    factor: factor ? String(factor) : '',
    price: initialPrice(pack, base, factor),
    cost: initialCost(pack, base, factor),
    sellablePos: !packIsPosHidden(unitName),
    purchasable: true,
    moveStock,
    swapped,
    foundBase,
    baseSkuInput: '',
    creating: false,
    newName: c.newBase.name,
    newUnit: c.newBase.unit,
    newPrice: '',
    newCost: '',
    ...keep,
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
    Object.fromEntries(all.map((c) => [c.key, makeDraft(c)])),
  )
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<'todo' | 'done'>(all.length > 0 ? 'todo' : 'done')
  const [search, setSearch] = useState('')
  // ยอดสต็อคของแถวแพ็กที่ย้ายระบบมา นับของกองเดียวกับหน่วยย่อยอยู่แล้ว — ปกติจึงไม่ย้ายมาบวก
  const [moveStockAll, setMoveStockAll] = useState(false)

  function setMoveStockForAll(on: boolean) {
    setMoveStockAll(on)
    setDrafts((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v, moveStock: on }])))
  }

  function setDraft(key: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }))
  }

  /** ด้านที่ถูกยุบ / ด้านที่อยู่ต่อ ตามสถานะสลับของแถวนั้น */
  function sidesOf(c: MergeCandidate) {
    const d = drafts[c.key]
    const other = c.base ?? d.foundBase
    return d.swapped && other
      ? { pack: other, base: c.pack }
      : { pack: c.pack, base: other }
  }

  const q = search.trim().toLowerCase()
  const visible = all.filter(
    (c) => !q || c.pack.sku.toLowerCase().includes(q) || c.pack.name.toLowerCase().includes(q) || c.baseCode.toLowerCase().includes(q),
  )
  const selectedIds = Object.keys(selected).filter((id) => selected[id])

  async function resolveBase(c: MergeCandidate) {
    const sku = drafts[c.key].baseSkuInput.trim()
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
    if (data.id === c.pack.id) {
      toast.error('เลือกตัวเดียวกับที่จะยุบไม่ได้')
      return
    }
    const found: Side = {
      id: data.id,
      sku: data.sku ?? '',
      name: data.name,
      unit: data.unit,
      price: data.price,
      cost: data.cost,
      stock: ((data.product_lots ?? []) as { quantity: number }[]).reduce((s, l) => s + l.quantity, 0),
      nameHint: null,
    }
    setDrafts((d) => ({ ...d, [c.key]: makeDraft(c, false, found, d[c.key].moveStock) }))
    toast.success(`ผูกกับ ${found.name}`)
  }

  /** สร้างสินค้าหน่วยย่อยจากตัวแพ็ก (รายการที่ไม่เคยมีตัวฐานในระบบ) */
  async function createBase(c: MergeCandidate): Promise<Side | null> {
    const d = drafts[c.key]
    const factor = parseInt(d.factor)
    const price = parseFloat(d.newPrice)
    if (!d.newName.trim() || !d.newUnit.trim()) {
      toast.error('ใส่ชื่อกับหน่วยของสินค้าหน่วยย่อย')
      return null
    }
    if (!factor || factor < 2) {
      toast.error('ใส่ตัวคูณก่อน (1 แพ็กกี่หน่วยย่อย)')
      return null
    }
    if (!price || price <= 0) {
      toast.error('ใส่ราคาขายต่อหน่วยย่อย')
      return null
    }
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: d.newName.trim(),
        sku: c.baseCode,
        category_id: c.newBase.categoryId,
        supplier_id: c.newBase.supplierId,
        vat_applicable: c.newBase.vatApplicable,
        clinic_only: c.newBase.clinicOnly,
        price,
        cost: d.newCost === '' ? null : parseFloat(d.newCost),
        unit: d.newUnit.trim(),
      })
      .select('id, sku, name, unit, price, cost')
      .single()
    if (error || !data) {
      toast.error(
        error?.code === '23505'
          ? `SKU ${c.baseCode} ซ้ำกับสินค้าที่มีอยู่แล้ว`
          : 'สร้างสินค้าไม่สำเร็จ: ' + (error?.message ?? ''),
      )
      return null
    }
    return { ...data, sku: data.sku ?? '', cost: data.cost, stock: 0, nameHint: null }
  }

  /** ยุบหนึ่งแถว — คืน true เมื่อสำเร็จ */
  async function mergeOne(c: MergeCandidate, baseOverride?: Side): Promise<boolean> {
    const d = drafts[c.key]
    const { pack, base: sideBase } = sidesOf(c)
    const base = baseOverride ?? sideBase
    const factor = parseInt(d.factor)
    if (!base) {
      toast.error(`${pack.sku}: ยังไม่ได้เลือกสินค้าหน่วยย่อย`)
      return false
    }
    if (!factor || factor < 2) {
      toast.error(`${pack.sku}: ตัวคูณต้องเป็นจำนวนเต็มตั้งแต่ 2 ขึ้นไป`)
      return false
    }
    if (!d.unitName.trim()) {
      toast.error(`${pack.sku}: ยังไม่ได้ตั้งชื่อหน่วย`)
      return false
    }
    const { error } = await supabase.rpc('merge_pack_product', {
      p_pack_product_id: pack.id,
      p_base_product_id: base.id,
      p_unit_name: d.unitName.trim(),
      p_factor: factor,
      p_price: d.price === '' ? null : parseFloat(d.price),
      p_cost: d.cost === '' ? null : parseFloat(d.cost),
      p_sellable_pos: d.sellablePos,
      p_purchasable: d.purchasable,
      p_created_by: userId || null,
      p_move_stock: d.moveStock,
    })
    if (error) {
      toast.error(`${pack.sku}: ${error.message}`)
      return false
    }
    return true
  }

  async function handleMerge(c: MergeCandidate) {
    const d = drafts[c.key]
    const { pack, base } = sidesOf(c)
    const factor = parseInt(d.factor) || 0
    const creating = !base && d.creating

    const { confirmed } = await confirmDialog({
      title: creating
        ? `สร้าง ${c.baseCode} แล้วยุบ ${pack.sku} เป็น "${d.unitName}"`
        : `ยุบ ${pack.sku} เป็น "${d.unitName}" ของ ${base?.sku ?? '—'}`,
      message:
        (creating
          ? `สร้างสินค้าใหม่ ${c.baseCode} · ${d.newName} · ฿${d.newPrice || '0'}/${d.newUnit}\n`
          : '') +
        `1 ${d.unitName} = ${factor} ${creating ? d.newUnit : base?.unit ?? ''}` +
        (pack.stock === 0
          ? '\nไม่มีสต็อคค้างฝั่งหน่วยใหญ่'
          : d.moveStock
            ? `\nสต็อค ${pack.stock} ${d.unitName} → ย้ายไปรวมเป็น ${pack.stock * factor} ${creating ? d.newUnit : base?.unit ?? ''}`
            : `\nตัดยอด ${pack.stock} ${d.unitName} ของหน่วยใหญ่ทิ้ง — สต็อคใช้ของหน่วยย่อย${base ? ` (${base.stock} ${base.unit})` : ''}`) +
        `\n\nย้อนคืนเองไม่ได้ — ถ้าตัวคูณผิดต้องไปปรับสต็อคที่หน้าสินค้าทีหลัง`,
      confirmLabel: creating ? 'สร้าง + ยุบรวม' : 'ยุบรวม',
    })
    if (!confirmed) return

    setBusy(c.key)
    let override: Side | undefined
    if (creating) {
      const made = await createBase(c)
      if (!made) {
        setBusy(null)
        return
      }
      override = made
    }
    const ok = await mergeOne(c, override)
    setBusy(null)
    if (ok) {
      toast.success(`ยุบ ${pack.sku} แล้ว`)
      router.refresh()
    }
  }

  async function handleMergeSelected() {
    const rows = all.filter((c) => selected[c.key] && sidesOf(c).base)
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
        setSelected((s) => ({ ...s, [c.key]: false }))
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
        {orphans.length > 0 && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
            {orphans.length} รายการไม่มีสินค้าหน่วยย่อยในระบบ — สร้างให้ได้ในแถวนั้น
          </span>
        )}
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

          <label className="flex items-start gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox" checked={moveStockAll}
              onChange={(e) => setMoveStockForAll(e.target.checked)}
              className="mt-0.5 w-4 h-4"
            />
            <span className="text-xs text-gray-600 leading-relaxed">
              <span className="font-medium text-gray-900">ย้ายสต็อคของหน่วยใหญ่มารวมด้วย (× ตัวคูณ)</span>
              <span className="block text-gray-500">
                ปกติ<span className="font-medium">ไม่ต้องติ๊ก</span> — ยอดที่ย้ายระบบเข้ามานับของกองเดียวกันไว้ทั้งสองแถว
                เอามาคูณบวกอีกจะบวมกว่าของจริง ระบบจะตัดยอดฝั่งหน่วยใหญ่ทิ้งแล้วใช้ยอดของหน่วยเล็กสุดที่มีอยู่
              </span>
            </span>
          </label>

          {all.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
              <Boxes size={32} className="mx-auto mb-2 text-gray-300" />
              ไม่มีสินค้าแพ็กที่ยังไม่ได้ยุบ
            </div>
          )}

          <div className="space-y-3">
            {visible.map((c) => {
              const d = drafts[c.key]
              const { pack, base } = sidesOf(c)
              const factor = parseInt(d.factor) || 0
              const price = parseFloat(d.price) || 0
              const cost = d.cost === '' ? null : parseFloat(d.cost)
              const baseUnit = base?.unit ?? (d.creating ? d.newUnit : 'หน่วยฐาน')
              const basePrice = base?.price ?? (d.creating ? parseFloat(d.newPrice) || 0 : 0)
              const fullPrice = basePrice * factor
              const discountPct = fullPrice > 0 && price > 0 ? ((fullPrice - price) / fullPrice) * 100 : 0
              const costPerBase = cost != null && factor > 0 ? cost / factor : null
              const costRatio = pack.cost && base?.cost ? pack.cost / base.cost : null
              const priceRatio = base && base.price > 0 ? pack.price / base.price : null
              const canSwap = Boolean(c.base ?? d.foundBase)

              return (
                <div key={c.key} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[c.key])}
                      onChange={(e) => setSelected((s) => ({ ...s, [c.key]: e.target.checked }))}
                      className="mt-1 w-4 h-4"
                      disabled={!base}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-gray-400">ยุบตัวนี้</span>
                        <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{pack.sku}</span>
                        <span className="text-sm font-medium text-gray-900 truncate">{pack.name}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ขาย ฿{money(pack.price)} · ทุน {pack.cost != null ? `฿${money(pack.cost)}` : '—'} ·
                        สต็อคค้าง {pack.stock} {pack.unit}
                        {pack.nameHint && <span className="text-blue-600"> · ชื่อบอก x{pack.nameHint}</span>}
                      </p>
                    </div>
                    {canSwap && (
                      <button
                        onClick={() => setDrafts((s) => ({ ...s, [c.key]: makeDraft(c, !d.swapped, d.foundBase, d.moveStock) }))}
                        title="สลับว่าตัวไหนเป็นหน่วยย่อย"
                        className="shrink-0 flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-600 border border-gray-200 rounded-lg px-2 py-1"
                      >
                        <ArrowLeftRight size={12} />
                        สลับ
                      </button>
                    )}
                  </div>

                  {base ? (
                    <p className="text-xs text-gray-600 mb-3 bg-gray-50 rounded-lg px-3 py-2">
                      หน่วยย่อย <span className="font-mono">{base.sku}</span> · {base.name} ·
                      ขาย ฿{money(base.price)}/{base.unit} ·
                      ทุน {base.cost != null ? `฿${money(base.cost)}` : '—'} ·
                      สต็อค {base.stock} {base.unit}
                    </p>
                  ) : d.creating ? (
                    <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-amber-800 mb-2">
                        สร้างสินค้าหน่วยย่อยใหม่ (SKU <span className="font-mono">{c.baseCode}</span>)
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="block sm:col-span-2">
                          <span className="text-xs text-gray-500">ชื่อสินค้า</span>
                          <input value={d.newName} onChange={(e) => setDraft(c.key, { newName: e.target.value })} className={inputClass} />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500">หน่วยย่อย</span>
                          <input value={d.newUnit} onChange={(e) => setDraft(c.key, { newUnit: e.target.value })} className={inputClass} />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500">ราคาขาย/{d.newUnit || 'หน่วย'}</span>
                          <input
                            type="number" min="0" step="0.01" value={d.newPrice}
                            onChange={(e) => setDraft(c.key, { newPrice: e.target.value })}
                            placeholder={factor ? (pack.price / factor).toFixed(2) : ''}
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500">ทุน/{d.newUnit || 'หน่วย'}</span>
                          <input
                            type="number" min="0" step="0.01" value={d.newCost}
                            onChange={(e) => setDraft(c.key, { newCost: e.target.value })}
                            placeholder={factor && pack.cost != null ? (pack.cost / factor).toFixed(2) : ''}
                            className={inputClass}
                          />
                        </label>
                      </div>
                      <button
                        onClick={() => setDraft(c.key, { creating: false })}
                        className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                      >
                        ยกเลิกการสร้างใหม่
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                      <span className="text-xs text-amber-700">
                        ไม่มีสินค้ารหัส {c.baseCode} ในระบบ — กรอก SKU หน่วยย่อยเอง หรือสร้างใหม่
                      </span>
                      <input
                        value={d.baseSkuInput}
                        onChange={(e) => setDraft(c.key, { baseSkuInput: e.target.value })}
                        placeholder="SKU หน่วยย่อย"
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-36"
                      />
                      <button
                        onClick={() => resolveBase(c)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1"
                      >
                        ค้นหา
                      </button>
                      <button
                        onClick={() => setDraft(c.key, { creating: true })}
                        className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800 border border-amber-300 rounded-lg px-2 py-1"
                      >
                        <PackagePlus size={12} />
                        สร้างสินค้าหน่วยย่อย
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <label className="block">
                      <span className="text-xs text-gray-500">ชื่อหน่วย</span>
                      <input value={d.unitName} onChange={(e) => setDraft(c.key, { unitName: e.target.value })} className={inputClass} />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500">
                        1 {d.unitName || 'หน่วย'} = กี่ {baseUnit}
                      </span>
                      <input
                        type="number" min="2" step="1" value={d.factor}
                        onChange={(e) => setDraft(c.key, { factor: e.target.value })}
                        className={inputClass}
                      />
                      <span className="text-[11px] text-gray-400 block mt-0.5">
                        {pack.nameHint
                          ? `จากชื่อสินค้า x${pack.nameHint}`
                          : costRatio && costRatio >= 1.5
                            ? `จากทุน ${costRatio.toFixed(2)}`
                            : 'จากราคา'}
                        {priceRatio ? ` · ราคา ${priceRatio.toFixed(2)}` : ''}
                      </span>
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500">ราคายก{d.unitName || 'แพ็ก'}</span>
                      <input
                        type="number" min="0" step="0.01" value={d.price}
                        onChange={(e) => setDraft(c.key, { price: e.target.value })}
                        className={inputClass}
                      />
                      <span
                        className={`text-[11px] block mt-0.5 ${
                          discountPct < 0
                            ? 'text-red-500'
                            : discountLooksOff(price, basePrice, factor)
                              ? 'text-amber-600 font-medium'
                              : 'text-gray-400'
                        }`}
                      >
                        {factor > 0 && fullPrice > 0
                          ? discountPct >= 0
                            ? `ลด ${discountPct.toFixed(1)}% จาก ฿${money(fullPrice)}${
                                discountLooksOff(price, basePrice, factor) ? ' — ลดลึกผิดปกติ เช็กตัวคูณ/ราคา' : ''
                              }`
                            : `แพงกว่าซื้อแยก ${Math.abs(discountPct).toFixed(1)}%`
                          : ''}
                      </span>
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-500">ทุนต่อ{d.unitName || 'แพ็ก'}</span>
                      <input
                        type="number" min="0" step="0.01" value={d.cost}
                        onChange={(e) => setDraft(c.key, { cost: e.target.value })}
                        className={inputClass}
                      />
                      <span className="text-[11px] text-gray-400 block mt-0.5">
                        {costPerBase != null ? `= ฿${money(costPerBase)}/${baseUnit}` : ''}
                      </span>
                    </label>
                    <div className="space-y-1.5 pt-4">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox" checked={d.sellablePos}
                          onChange={(e) => setDraft(c.key, { sellablePos: e.target.checked })}
                          className="w-4 h-4"
                        />
                        โชว์หน้าขาย
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox" checked={d.purchasable}
                          onChange={(e) => setDraft(c.key, { purchasable: e.target.checked })}
                          className="w-4 h-4"
                        />
                        ใช้สั่งของ
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox" checked={d.moveStock}
                          onChange={(e) => setDraft(c.key, { moveStock: e.target.checked })}
                          className="w-4 h-4"
                        />
                        ย้ายสต็อค
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-500">
                      {pack.stock === 0
                        ? 'ไม่มีสต็อคค้างฝั่งหน่วยใหญ่'
                        : d.moveStock && factor > 0
                          ? `ย้ายสต็อค ${pack.stock} × ${factor} = ${pack.stock * factor} ${baseUnit} ไปรวมกับหน่วยย่อย`
                          : `ตัดยอด ${pack.stock} ${d.unitName || pack.unit} ของหน่วยใหญ่ทิ้ง — สต็อคใช้ของหน่วยย่อย${
                              base ? ` ${base.stock} ${base.unit}` : ''
                            }`}
                      {pack.stock !== 0 && !d.moveStock && base && base.stock === 0 && (
                        <span className="block text-amber-600 font-medium">
                          หน่วยย่อยไม่มีสต็อคเลย — ยุบแล้วจะเหลือ 0 ติ๊ก &quot;ย้ายสต็อค&quot; ถ้าของมีจริงบนชั้น
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => handleMerge(c)}
                      disabled={(!base && !d.creating) || busy !== null}
                      className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                    >
                      {busy === c.key ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {!base && d.creating ? 'สร้าง + ยุบรวม' : 'ยุบรวม'}
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
