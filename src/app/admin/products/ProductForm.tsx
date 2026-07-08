'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import type { Category, Product } from '@/lib/types'

interface Props {
  categories: Category[]
  product?: Product
}

export default function ProductForm({ categories, product }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: product?.name ?? '',
    barcode: product?.barcode ?? '',
    category_id: product?.category_id ?? '',
    price: product?.price?.toString() ?? '',
    cost: product?.cost?.toString() ?? '',
    unit: product?.unit ?? 'ชิ้น',
    min_stock: product?.min_stock?.toString() ?? '5',
  })

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const payload = {
      name: form.name,
      barcode: form.barcode || null,
      category_id: form.category_id || null,
      price: parseFloat(form.price),
      cost: form.cost ? parseFloat(form.cost) : null,
      unit: form.unit,
      min_stock: parseInt(form.min_stock),
    }

    const { error } = product
      ? await supabase.from('products').update(payload).eq('id', product.id)
      : await supabase.from('products').insert(payload)

    if (error) {
      toast.error('เกิดข้อผิดพลาด: ' + error.message)
      setLoading(false)
      return
    }

    toast.success(product ? 'แก้ไขสินค้าแล้ว' : 'เพิ่มสินค้าแล้ว')
    router.push('/admin/products')
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl">
      <div className="space-y-4">
        <div>
          <label className={labelClass}>ชื่อสินค้า *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputClass}
            placeholder="เช่น อาหารแมว Royal Canin 1kg"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>บาร์โค้ด</label>
            <input
              type="text"
              value={form.barcode}
              onChange={(e) => set('barcode', e.target.value)}
              className={inputClass}
              placeholder="8850xxxxxxx"
            />
          </div>
          <div>
            <label className={labelClass}>หน่วย</label>
            <input
              type="text"
              required
              value={form.unit}
              onChange={(e) => set('unit', e.target.value)}
              className={inputClass}
              placeholder="ชิ้น / ถุง / กระป๋อง"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>หมวดหมู่</label>
          <select
            value={form.category_id}
            onChange={(e) => set('category_id', e.target.value)}
            className={inputClass}
          >
            <option value="">— ไม่ระบุ —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>ราคาขาย (บาท) *</label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              className={inputClass}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelClass}>ราคาทุน (บาท)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cost}
              onChange={(e) => set('cost', e.target.value)}
              className={inputClass}
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>แจ้งเตือนเมื่อสต็อคต่ำกว่า</label>
          <input
            type="number"
            min="0"
            value={form.min_stock}
            onChange={(e) => set('min_stock', e.target.value)}
            className={inputClass}
            placeholder="5"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? 'กำลังบันทึก...' : product ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  )
}
