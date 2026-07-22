'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Edit, Trash2, X, Check, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Promotion, Category, PromotionType, ApplyTo } from '@/lib/types'

interface ProductOption {
  id: string
  name: string
}

const emptyForm = {
  name: '',
  type: 'percent_discount' as PromotionType,
  discount_percent: '',
  buy_quantity: '',
  get_quantity: '',
  apply_to: 'all' as ApplyTo,
  category_id: '',
  product_id: '',
  start_date: new Date().toISOString().split('T')[0],
  end_date: new Date().toISOString().split('T')[0],
  active: true,
}

const todayStr = () => new Date().toISOString().split('T')[0]

function describe(p: Promotion, categories: Category[], products: ProductOption[]) {
  const detail = p.type === 'percent_discount'
    ? `ลด ${p.discount_percent}%`
    : `ซื้อ ${p.buy_quantity} แถม ${p.get_quantity}`
  const scope = p.apply_to === 'all'
    ? 'ทุกสินค้า'
    : p.apply_to === 'category'
      ? `หมวด: ${categories.find((c) => c.id === p.category_id)?.name ?? '—'}`
      : `สินค้า: ${products.find((pr) => pr.id === p.product_id)?.name ?? '—'}`
  return { detail, scope }
}

export default function PromotionsClient({
  promotions,
  categories,
  products,
}: {
  promotions: Promotion[]
  categories: Category[]
  products: ProductOption[]
}) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)

  function set<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit(p: Promotion) {
    setEditingId(p.id)
    setShowAdd(false)
    setForm({
      name: p.name,
      type: p.type,
      discount_percent: p.discount_percent?.toString() ?? '',
      buy_quantity: p.buy_quantity?.toString() ?? '',
      get_quantity: p.get_quantity?.toString() ?? '',
      apply_to: p.apply_to,
      category_id: p.category_id ?? '',
      product_id: p.product_id ?? '',
      start_date: p.start_date,
      end_date: p.end_date,
      active: p.active,
    })
  }

  function cancel() {
    setShowAdd(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error('กรุณาใส่ชื่อโปรโมชั่น')
      return
    }
    if (form.type === 'percent_discount' && (!form.discount_percent || parseFloat(form.discount_percent) <= 0)) {
      toast.error('กรุณาใส่เปอร์เซ็นต์ส่วนลด')
      return
    }
    if (form.type === 'buy_x_get_y' && (!form.buy_quantity || !form.get_quantity)) {
      toast.error('กรุณาใส่จำนวนซื้อและแถม')
      return
    }
    if (form.apply_to === 'category' && !form.category_id) {
      toast.error('กรุณาเลือกหมวดหมู่')
      return
    }
    if (form.apply_to === 'product' && !form.product_id) {
      toast.error('กรุณาเลือกสินค้า')
      return
    }
    if (form.start_date > form.end_date) {
      toast.error('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const payload = {
      name: form.name.trim(),
      type: form.type,
      discount_percent: form.type === 'percent_discount' ? parseFloat(form.discount_percent) : null,
      buy_quantity: form.type === 'buy_x_get_y' ? parseInt(form.buy_quantity, 10) : null,
      get_quantity: form.type === 'buy_x_get_y' ? parseInt(form.get_quantity, 10) : null,
      apply_to: form.apply_to,
      category_id: form.apply_to === 'category' ? form.category_id : null,
      product_id: form.apply_to === 'product' ? form.product_id : null,
      start_date: form.start_date,
      end_date: form.end_date,
      active: form.active,
    }

    const { data, error } = editingId
      ? await supabase.from('promotions').update(payload).eq('id', editingId).select('id').single()
      : await supabase.from('promotions').insert(payload).select('id').single()

    setLoading(false)
    if (error) {
      toast.error('เกิดข้อผิดพลาด: ' + error.message)
      return
    }

    if (editingId) {
      toast.success('แก้ไขแล้ว')
    } else {
      // เพิ่งสร้างเสร็จ = จังหวะที่มักอยากได้ป้ายไปติดหน้าร้านเลย
      toast.success(
        (t) => (
          <span className="flex items-center gap-3">
            เพิ่มโปรโมชั่นแล้ว
            <a
              href={`/print/promotion/${data.id}`}
              onClick={() => toast.dismiss(t.id)}
              className="flex items-center gap-1 text-blue-600 font-medium whitespace-nowrap"
            >
              <Printer size={14} /> พิมพ์ป้าย
            </a>
          </span>
        ),
        { duration: 8000 },
      )
    }
    cancel()
    router.refresh()
  }

  async function remove(p: Promotion) {
    if (!confirm(`ลบโปรโมชั่น "${p.name}" ?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('promotions').delete().eq('id', p.id)
    if (error) {
      toast.error('ลบไม่สำเร็จ')
      return
    }
    toast.success('ลบแล้ว')
    router.refresh()
  }

  async function toggleActive(p: Promotion) {
    const supabase = createClient()
    const { error } = await supabase.from('promotions').update({ active: !p.active }).eq('id', p.id)
    if (error) {
      toast.error('เปลี่ยนสถานะไม่สำเร็จ')
      return
    }
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const today = todayStr()

  const formCard = (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อโปรโมชั่น *</label>
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} placeholder="เช่น ลดหน้าร้อน 10%" autoFocus />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ประเภท *</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value as PromotionType)} className={inputClass}>
            <option value="percent_discount">ลดเปอร์เซ็นต์</option>
            <option value="buy_x_get_y">ซื้อ X แถม Y</option>
          </select>
        </div>

        {form.type === 'percent_discount' ? (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ลดกี่เปอร์เซ็นต์ *</label>
            <input
              type="number" min={0.01} max={100} step="0.01"
              value={form.discount_percent}
              onChange={(e) => set('discount_percent', e.target.value)}
              className={inputClass}
              placeholder="เช่น 10"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ซื้อ *</label>
              <input type="number" min={1} value={form.buy_quantity} onChange={(e) => set('buy_quantity', e.target.value)} className={inputClass} placeholder="2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">แถม *</label>
              <input type="number" min={1} value={form.get_quantity} onChange={(e) => set('get_quantity', e.target.value)} className={inputClass} placeholder="1" />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ใช้กับ *</label>
          <select value={form.apply_to} onChange={(e) => set('apply_to', e.target.value as ApplyTo)} className={inputClass}>
            <option value="all">ทุกสินค้า</option>
            <option value="category">เฉพาะหมวดหมู่</option>
            <option value="product">เฉพาะสินค้า</option>
          </select>
        </div>

        {form.apply_to === 'category' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">หมวดหมู่ *</label>
            <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)} className={inputClass}>
              <option value="">— เลือกหมวดหมู่ —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {form.apply_to === 'product' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">สินค้า *</label>
            <select value={form.product_id} onChange={(e) => set('product_id', e.target.value)} className={inputClass}>
              <option value="">— เลือกสินค้า —</option>
              {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่เริ่ม *</label>
          <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">วันที่สิ้นสุด *</label>
          <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} className={inputClass} />
        </div>

        <div className="sm:col-span-2 flex items-center gap-2">
          <input type="checkbox" id="promo-active" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          <label htmlFor="promo-active" className="text-sm text-gray-700">เปิดใช้งาน</label>
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
        <h1 className="text-2xl font-bold text-gray-900">โปรโมชั่น</h1>
        {!showAdd && !editingId && (
          <button
            onClick={() => { setShowAdd(true); setForm(emptyForm) }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} /> เพิ่มโปรโมชั่น
          </button>
        )}
      </div>

      {showAdd && formCard}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ชื่อ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">รายละเอียด</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ใช้กับ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ช่วงเวลา</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {promotions.map((p) => {
              if (editingId === p.id) {
                return (
                  <tr key={p.id}>
                    <td colSpan={6} className="px-4 py-3">{formCard}</td>
                  </tr>
                )
              }
              const { detail, scope } = describe(p, categories, products)
              const expired = p.end_date < today
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{detail}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{scope}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {p.start_date} - {p.end_date}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                        !p.active
                          ? 'bg-gray-100 text-gray-500'
                          : expired
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                      }`}
                      title="กดเพื่อเปิด/ปิดใช้งาน"
                    >
                      {!p.active ? 'ปิดใช้งาน' : expired ? 'หมดอายุ' : 'ใช้งานอยู่'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        href={`/print/promotion/${p.id}`}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        title="พิมพ์ป้ายโปรโมชั่น"
                      >
                        <Printer size={15} />
                      </Link>
                      <button onClick={() => startEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                        <Edit size={15} />
                      </button>
                      <button onClick={() => remove(p)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {promotions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  ยังไม่มีโปรโมชั่น — กด &quot;เพิ่มโปรโมชั่น&quot; เพื่อเริ่มต้น
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
