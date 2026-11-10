'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2, X, Check, Gift } from 'lucide-react'
import toast from 'react-hot-toast'
import type { PointsConfig, Reward } from '@/lib/types'
import { confirmDialog } from '@/lib/confirm'
import { ProductPicker, stockOf, type ProductOption } from '@/app/admin/receiving/pickers'

/** แถวของแลกพร้อมสินค้าที่ผูกไว้ (join มาจากหน้า server) */
interface RewardRow extends Reward {
  products: {
    id: string
    name: string
    sku: string | null
    unit: string
    price: number
    product_lots: { quantity: number; expiry_date: string | null }[]
  } | null
}

const emptyForm = { product_id: '', points_cost: '', max_per_bill: '1', note: '' }

const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

/** ล็อตที่ใกล้หมดอายุที่สุดและยังมีของ — ตัวที่จะถูกหยิบไปให้ลูกค้าก่อน */
function nextExpiry(lots: { quantity: number; expiry_date: string | null }[]) {
  return lots
    .filter((l) => l.quantity > 0 && l.expiry_date)
    .map((l) => l.expiry_date as string)
    .sort()[0] ?? null
}

export default function RewardsClient({
  rewards,
  products,
  pointsConfig,
}: {
  rewards: RewardRow[]
  products: ProductOption[]
  pointsConfig: PointsConfig | null
}) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // แต้มเท่านี้ถ้าเอาไปลดเงินแทนจะได้กี่บาท — ไว้เทียบว่าแลกของคุ้มกว่าจริงไหม
  const bahtPerPoint = pointsConfig && pointsConfig.redeem_points > 0
    ? pointsConfig.redeem_value / pointsConfig.redeem_points
    : null

  function startEdit(r: RewardRow) {
    setEditingId(r.id)
    setShowAdd(false)
    setForm({
      product_id: r.product_id,
      points_cost: String(r.points_cost),
      max_per_bill: String(r.max_per_bill),
      note: r.note ?? '',
    })
  }

  function cancel() {
    setShowAdd(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function save() {
    const points = parseInt(form.points_cost || '0', 10)
    const maxPerBill = parseInt(form.max_per_bill || '0', 10)
    if (!form.product_id) {
      toast.error('เลือกสินค้าที่จะให้แลกก่อน')
      return
    }
    if (!points || points <= 0) {
      toast.error('ใส่จำนวนแต้มที่ใช้แลก')
      return
    }
    if (!maxPerBill || maxPerBill <= 0) {
      toast.error('แลกได้สูงสุดต่อบิลต้องมากกว่า 0')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const payload = {
      product_id: form.product_id,
      points_cost: points,
      max_per_bill: maxPerBill,
      note: form.note.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = editingId
      ? await supabase.from('rewards').update(payload).eq('id', editingId)
      : await supabase.from('rewards').insert(payload)

    setLoading(false)
    if (error) {
      toast.error(error.code === '23505' ? 'สินค้าตัวนี้เป็นของแลกอยู่แล้ว' : 'เกิดข้อผิดพลาด: ' + error.message)
      return
    }
    toast.success(editingId ? 'แก้ไขแล้ว' : 'เพิ่มของแลกแล้ว')
    cancel()
    router.refresh()
  }

  async function toggleActive(r: RewardRow) {
    const supabase = createClient()
    const { error } = await supabase
      .from('rewards')
      .update({ active: !r.active, updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (error) {
      toast.error('บันทึกไม่สำเร็จ')
      return
    }
    toast.success(r.active ? 'ปิดของแลกนี้แล้ว' : 'เปิดให้แลกแล้ว')
    router.refresh()
  }

  async function remove(r: RewardRow) {
    const ok = await confirmDialog({
      message: `เอา "${r.products?.name ?? 'สินค้า'}" ออกจากรายการของแลก? สินค้าและสต็อกไม่ถูกลบ และบิลเก่าที่แลกไปแล้วยังอยู่ครบ`,
    })
    if (!ok.confirmed) return
    const supabase = createClient()
    const { error } = await supabase.from('rewards').delete().eq('id', r.id)
    if (error) {
      toast.error('ลบไม่สำเร็จ')
      return
    }
    toast.success('เอาออกจากรายการของแลกแล้ว')
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const picked = products.find((p) => p.id === form.product_id)
  const pointsPreview = parseInt(form.points_cost || '0', 10)
  const asDiscount = bahtPerPoint !== null && pointsPreview > 0 ? pointsPreview * bahtPerPoint : null

  const formCard = (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">สินค้าที่ให้แลก *</label>
          {/* แก้อยู่ = ล็อกสินค้าไว้ เปลี่ยนตัวสินค้าให้ลบแถวแล้วเพิ่มใหม่ ไม่งั้นแต้มของเดิมจะไปติดของใหม่ */}
          {editingId ? (
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
              {rewards.find((r) => r.id === editingId)?.products?.name ?? '—'}
            </div>
          ) : (
            <ProductPicker
              products={products}
              value={form.product_id}
              onChange={(id) => set('product_id', id)}
              supplierId=""
            />
          )}
          {picked && !editingId && (
            <p className="text-xs text-gray-500 mt-1">
              คงเหลือ {stockOf(picked)} {picked.unit}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ใช้กี่แต้มต่อชิ้น *</label>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={form.points_cost}
            onChange={(e) => set('points_cost', e.target.value)}
            className={inputClass}
            placeholder="เช่น 100"
          />
          {asDiscount !== null && (
            <p className="text-xs text-gray-500 mt-1">
              แต้มเท่านี้ถ้าเอาไปลดเงินได้ ฿{asDiscount.toFixed(2)} — ของแลกควรดูคุ้มกว่านี้
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">แลกได้สูงสุดต่อบิล *</label>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={form.max_per_bill}
            onChange={(e) => set('max_per_bill', e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ (แคชเชียร์เห็นตอนแลก)</label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            className={inputClass}
            placeholder="เช่น เฉพาะล็อตที่ใกล้หมดอายุ / หมดแล้วหมดเลย"
          />
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
      {!pointsConfig && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ระบบสะสมแต้มปิดอยู่ — เปิดที่หน้าตั้งค่าก่อน ไม่งั้นหน้าขายจะไม่ให้แลกของ
        </div>
      )}

      {!showAdd && !editingId && (
        <button
          onClick={() => { setShowAdd(true); setForm(emptyForm) }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors mb-4"
        >
          <Plus size={16} /> เพิ่มของแลก
        </button>
      )}

      {showAdd && formCard}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ของแลก</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">แต้ม/ชิ้น</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">สูงสุด/บิล</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สต็อก</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rewards.map((r) => {
              if (editingId === r.id) {
                return (
                  <tr key={r.id}>
                    <td colSpan={6} className="px-4 py-3">{formCard}</td>
                  </tr>
                )
              }
              const stock = (r.products?.product_lots ?? []).reduce((s, l) => s + l.quantity, 0)
              const expiry = nextExpiry(r.products?.product_lots ?? [])
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{r.products?.name ?? '— สินค้าถูกลบ —'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      มูลค่าป้าย ฿{(r.products?.price ?? 0).toFixed(2)}
                      {r.note && ` · ${r.note}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-gray-900">{r.points_cost}</span>
                    {bahtPerPoint !== null && (
                      <p className="text-[11px] text-gray-400">≈ ลดเงิน ฿{(r.points_cost * bahtPerPoint).toFixed(2)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{r.max_per_bill}</td>
                  <td className="px-4 py-3">
                    <p className={`text-sm ${stock <= 0 ? 'text-red-500 font-medium' : 'text-gray-600'}`}>
                      {stock <= 0 ? 'หมด' : `${stock} ${r.products?.unit ?? ''}`}
                    </p>
                    {expiry && <p className="text-[11px] text-gray-400">ล็อตใกล้สุด {fmtDate(expiry)}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(r)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        r.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {r.active ? 'เปิดให้แลก' : 'ปิดอยู่'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(r)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                        <Edit size={15} />
                      </button>
                      <button onClick={() => remove(r)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {rewards.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  <Gift size={28} className="mx-auto mb-2 text-gray-300" />
                  ยังไม่มีของแลก — กด &quot;เพิ่มของแลก&quot; เพื่อเริ่มต้น
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
