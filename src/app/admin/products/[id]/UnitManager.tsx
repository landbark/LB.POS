'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BarcodeField from '@/components/BarcodeField'
import { Boxes, Plus, Trash2, Save, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/lib/confirm'
import type { ProductUnit } from '@/lib/types'

/**
 * หน่วยขายใหญ่ของสินค้า (กล่อง/ลัง) — สต็อคยังนับเป็นหน่วยย่อยกองเดียว
 * ตารางนี้แค่บอกว่า "หยิบทีละเท่าไหร่ ราคาเท่าไหร่"
 */

interface Props {
  productId: string
  baseUnit: string
  basePrice: number
  baseCost: number | null
  units: ProductUnit[]
}

interface Draft {
  unit_name: string
  factor: string
  sku: string
  barcode: string
  price: string
  cost: string
  sellable_pos: boolean
  sellable_online: boolean
  purchasable: boolean
}

const emptyDraft = (): Draft => ({
  unit_name: '',
  factor: '',
  sku: '',
  barcode: '',
  price: '',
  cost: '',
  sellable_pos: true,
  sellable_online: false,
  purchasable: true,
})

const toDraft = (u: ProductUnit): Draft => ({
  unit_name: u.unit_name,
  factor: String(u.factor),
  sku: u.sku ?? '',
  barcode: u.barcode ?? '',
  price: u.price != null ? String(u.price) : '',
  cost: u.cost != null ? String(u.cost) : '',
  sellable_pos: u.sellable_pos,
  sellable_online: u.sellable_online,
  purchasable: u.purchasable,
})

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inputClass =
  'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function UnitManager({ productId, baseUnit, basePrice, baseCost, units }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  function startAdd() {
    setDraft(emptyDraft())
    setEditing(null)
    setAdding(true)
  }

  function startEdit(u: ProductUnit) {
    setDraft(toDraft(u))
    setAdding(false)
    setEditing(u.id)
  }

  function cancel() {
    setAdding(false)
    setEditing(null)
  }

  async function save() {
    const factor = parseInt(draft.factor)
    if (!draft.unit_name.trim()) {
      toast.error('ใส่ชื่อหน่วย เช่น กล่อง / ลัง')
      return
    }
    if (!factor || factor < 2) {
      toast.error(`ใส่จำนวน ${baseUnit} ต่อ 1 ${draft.unit_name.trim() || 'หน่วย'} (ตั้งแต่ 2 ขึ้นไป)`)
      return
    }
    setBusy(true)
    const payload = {
      product_id: productId,
      unit_name: draft.unit_name.trim(),
      factor,
      sku: draft.sku.trim() || null,
      barcode: draft.barcode.trim() || null,
      // ไม่ใส่ราคา = ขายเท่าราคาหน่วยย่อยคูณจำนวน (ไม่ลด)
      price: draft.price === '' ? null : parseFloat(draft.price),
      cost: draft.cost === '' ? null : parseFloat(draft.cost),
      sellable_pos: draft.sellable_pos,
      sellable_online: draft.sellable_online,
      purchasable: draft.purchasable,
      sort_order: factor,
    }
    const { error } = editing
      ? await supabase.from('product_units').update(payload).eq('id', editing)
      : await supabase.from('product_units').insert(payload)
    setBusy(false)
    if (error) {
      toast.error(
        error.code === '23505'
          ? 'ชื่อหน่วย / SKU / บาร์โค้ด นี้ซ้ำกับที่มีอยู่แล้ว'
          : 'บันทึกไม่สำเร็จ: ' + error.message,
      )
      return
    }
    toast.success(editing ? 'บันทึกหน่วยแล้ว' : `เพิ่มหน่วย ${payload.unit_name} แล้ว`)
    cancel()
    router.refresh()
  }

  async function remove(u: ProductUnit) {
    const { confirmed } = await confirmDialog({
      title: `ลบหน่วย ${u.unit_name}?`,
      message:
        `สต็อคไม่กระทบ (นับเป็น${baseUnit}อยู่แล้ว) แต่บิลเก่าที่ขายยก${u.unit_name} จะไม่มีหน่วยนี้ให้อ้างอิง` +
        '\nถ้าแค่ไม่อยากให้ขายต่อ ติ๊ก "โชว์หน้าขาย" ออกพอ',
      confirmLabel: 'ลบหน่วย',
      tone: 'danger',
    })
    if (!confirmed) return
    const { error } = await supabase.from('product_units').delete().eq('id', u.id)
    if (error) toast.error('ลบไม่สำเร็จ: ' + error.message)
    else {
      toast.success('ลบแล้ว')
      router.refresh()
    }
  }

  const form = (
    <div className="bg-gray-50 rounded-xl p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-gray-500">ชื่อหน่วย</span>
          <input
            value={draft.unit_name}
            onChange={(e) => setDraft({ ...draft, unit_name: e.target.value })}
            placeholder="กล่อง"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">1 {draft.unit_name || 'หน่วย'} = กี่ {baseUnit}</span>
          <input
            type="number" min="2" step="1" value={draft.factor}
            onChange={(e) => setDraft({ ...draft, factor: e.target.value })}
            placeholder="12"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">ราคาขาย (เว้นว่าง = ไม่ลด)</span>
          <input
            type="number" min="0" step="0.01" value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            placeholder={parseInt(draft.factor) ? money(basePrice * parseInt(draft.factor)) : '0.00'}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">ทุนต่อ{draft.unit_name || 'หน่วย'}</span>
          <input
            type="number" min="0" step="0.01" value={draft.cost}
            onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
            placeholder={baseCost != null && parseInt(draft.factor) ? money(baseCost * parseInt(draft.factor)) : '0.00'}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">SKU (ใช้สั่งของ)</span>
          <input
            value={draft.sku}
            onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">บาร์โค้ดข้าง{draft.unit_name || 'แพ็ก'}</span>
          <BarcodeField
            value={draft.barcode}
            onChange={(code) => setDraft({ ...draft, barcode: code })}
            className={inputClass}
            title={`บาร์โค้ดข้าง${draft.unit_name || 'แพ็ก'}`}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {([
          ['sellable_pos', 'โชว์ในหน้าขาย'],
          ['purchasable', 'ใช้ตอนสั่งของ'],
          ['sellable_online', 'ขายบนเว็บ'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox" checked={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
              className="w-4 h-4"
            />
            {label}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
        >
          <Save size={14} />
          บันทึก
        </button>
        <button onClick={cancel} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5">
          <X size={14} />
          ยกเลิก
        </button>
      </div>
    </div>
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="flex items-center gap-2 font-bold text-gray-900">
          <Boxes size={18} className="text-gray-400" />
          หน่วยขายใหญ่
        </h2>
        {!adding && (
          <button onClick={startAdd} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
            <Plus size={14} />
            เพิ่มหน่วย
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        สต็อคนับเป็น{baseUnit}กองเดียวเสมอ — กล่อง/ลังเป็นแค่การหยิบทีละหลาย{baseUnit} ที่ตั้งราคาลดได้
      </p>

      {adding && <div className="mb-4">{form}</div>}

      <div className="space-y-2">
        {units.length === 0 && !adding && (
          <p className="text-sm text-gray-400 text-center py-6">ยังไม่มีหน่วยใหญ่ — ขายเป็น{baseUnit}เท่านั้น</p>
        )}
        {units.map((u) =>
          editing === u.id ? (
            <div key={u.id}>{form}</div>
          ) : (
            <div key={u.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    1 {u.unit_name} = {u.factor} {baseUnit}
                    {u.sku && <span className="ml-2 font-mono text-xs text-gray-400">{u.sku}</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    ขาย ฿{money(u.price ?? basePrice * u.factor)}
                    {u.price != null && u.price < basePrice * u.factor && (
                      <span className="text-green-600">
                        {' '}(ลด {Math.round((1 - u.price / (basePrice * u.factor)) * 100)}% จาก ฿{money(basePrice * u.factor)})
                      </span>
                    )}
                    {u.cost != null && ` · ทุน ฿${money(u.cost)}`}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {[
                      u.sellable_pos ? 'ขายหน้าร้าน' : 'ไม่โชว์หน้าขาย',
                      u.purchasable ? 'สั่งของได้' : 'ไม่ใช้สั่งของ',
                      u.sellable_online ? 'ขายบนเว็บ' : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(u)} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1">
                    แก้ไข
                  </button>
                  <button onClick={() => remove(u)} className="p-1 text-gray-300 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
