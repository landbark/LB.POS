'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Category, Product, Supplier, Unit } from '@/lib/types'
import ImageInput from '@/components/ImageInput'

interface Props {
  categories: Category[]
  units: Unit[]
  suppliers: Supplier[]
  product?: Product
}

export default function ProductForm({ categories, units, suppliers, product }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    category_id: product?.category_id ?? '',
    supplier_id: product?.supplier_id ?? '',
    price: product?.price?.toString() ?? '',
    cost: product?.cost?.toString() ?? '',
    unit: product?.unit ?? (units[0]?.name ?? 'ชิ้น'),
    min_stock: product?.min_stock?.toString() ?? '5',
  })

  // รูปใหม่ที่ crop/บีบอัดแล้วรออัปโหลด; preview = URL เดิมหรือ object URL ของรูปใหม่
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(product?.image_url ?? null)

  const [unitList, setUnitList] = useState(units)
  const [catList, setCatList] = useState(categories)
  const [addingUnit, setAddingUnit] = useState(false)
  const [addingCat, setAddingCat] = useState(false)
  const [newUnit, setNewUnit] = useState('')
  const [newCat, setNewCat] = useState('')

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function addUnit() {
    const name = newUnit.trim()
    if (!name) return
    const supabase = createClient()
    const { data, error } = await supabase
      .from('units')
      .insert({ name })
      .select()
      .single()
    if (error) {
      toast.error(error.code === '23505' ? 'มีหน่วยนี้อยู่แล้ว' : 'เพิ่มหน่วยไม่สำเร็จ')
      return
    }
    setUnitList([...unitList, data])
    set('unit', data.name)
    setNewUnit('')
    setAddingUnit(false)
    toast.success(`เพิ่มหน่วย "${data.name}" แล้ว`)
  }

  async function addCategory() {
    const name = newCat.trim()
    if (!name) return
    const supabase = createClient()
    const { data, error } = await supabase
      .from('categories')
      .insert({ name })
      .select()
      .single()
    if (error) {
      toast.error(error.code === '23505' ? 'มีหมวดหมู่นี้อยู่แล้ว' : 'เพิ่มหมวดหมู่ไม่สำเร็จ')
      return
    }
    setCatList([...catList, data])
    set('category_id', data.id)
    setNewCat('')
    setAddingCat(false)
    toast.success(`เพิ่มหมวดหมู่ "${data.name}" แล้ว`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    // อัปโหลดรูปใหม่ (ถ้ามี) ก่อนบันทึกสินค้า
    let imageUrl = product?.image_url ?? null
    if (imageBlob) {
      const fd = new FormData()
      fd.append('file', new File([imageBlob], 'product', { type: imageBlob.type }))
      const res = await fetch('/api/product-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error('อัปโหลดรูปไม่สำเร็จ: ' + (data.error ?? ''))
        setLoading(false)
        return
      }
      imageUrl = data.url
    } else if (!imagePreview) {
      imageUrl = null
    }

    // ลบไฟล์รูปเดิมออกจาก storage ถ้าถูกเปลี่ยนหรือลบ (ไม่ต้องรอผล)
    if (product?.image_url && imageUrl !== product.image_url) {
      fetch('/api/product-image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: product.image_url }),
      }).catch(() => {})
    }

    const supabase = createClient()
    const payload = {
      name: form.name,
      image_url: imageUrl,
      sku: form.sku.trim() || null,
      barcode: form.barcode || null,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      price: parseFloat(form.price),
      cost: form.cost ? parseFloat(form.cost) : null,
      unit: form.unit,
      min_stock: parseInt(form.min_stock),
    }

    const { error } = product
      ? await supabase.from('products').update(payload).eq('id', product.id)
      : await supabase.from('products').insert(payload)

    if (error) {
      toast.error(
        error.code === '23505'
          ? 'SKU หรือบาร์โค้ดนี้มีอยู่แล้ว กรุณาใช้ค่าอื่น'
          : 'เกิดข้อผิดพลาด: ' + error.message
      )
      setLoading(false)
      return
    }

    toast.success(product ? 'แก้ไขสินค้าแล้ว' : 'เพิ่มสินค้าแล้ว')
    router.push('/admin/products')
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'
  const addBtnClass = 'shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium'
  const inlineAddClass = 'flex gap-2 mt-2'
  const inlineInputClass = 'flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const inlineSaveClass = 'px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium'
  const inlineCancelClass = 'px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl">
      <div className="space-y-4">
        <ImageInput
          label="รูปสินค้า"
          hint="รูปจะถูก crop สี่เหลี่ยมจัตุรัสและย่อขนาดอัตโนมัติ"
          preview={imagePreview}
          onChange={(blob, previewUrl) => {
            setImageBlob(blob)
            setImagePreview(previewUrl)
          }}
        />

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
            <label className={labelClass}>SKU (รหัสสินค้า — ห้ามซ้ำ)</label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => set('sku', e.target.value)}
              className={inputClass}
              placeholder="เช่น LB-CAT-001"
            />
          </div>
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
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">หน่วย *</label>
              <button type="button" onClick={() => setAddingUnit(!addingUnit)} className={addBtnClass}>
                <Plus size={12} /> เพิ่มหน่วย
              </button>
            </div>
            <select
              required
              value={form.unit}
              onChange={(e) => set('unit', e.target.value)}
              className={inputClass}
            >
              {/* กันค่า unit เดิมของสินค้าที่ไม่อยู่ในตาราง units หาย */}
              {form.unit && !unitList.some((u) => u.name === form.unit) && (
                <option value={form.unit}>{form.unit}</option>
              )}
              {unitList.map((u) => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
            {addingUnit && (
              <div className={inlineAddClass}>
                <input
                  type="text"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUnit() } }}
                  className={inlineInputClass}
                  placeholder="เช่น กระสอบ"
                  autoFocus
                />
                <button type="button" onClick={addUnit} className={inlineSaveClass}>บันทึก</button>
                <button type="button" onClick={() => { setAddingUnit(false); setNewUnit('') }} className={inlineCancelClass}>ยกเลิก</button>
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>ซัพพลายเออร์</label>
            <select
              value={form.supplier_id}
              onChange={(e) => set('supplier_id', e.target.value)}
              className={inputClass}
            >
              <option value="">— ไม่ระบุ —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">หมวดหมู่</label>
            <button type="button" onClick={() => setAddingCat(!addingCat)} className={addBtnClass}>
              <Plus size={12} /> เพิ่มหมวดหมู่
            </button>
          </div>
          <select
            value={form.category_id}
            onChange={(e) => set('category_id', e.target.value)}
            className={inputClass}
          >
            <option value="">— ไม่ระบุ —</option>
            {catList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {addingCat && (
            <div className={inlineAddClass}>
              <input
                type="text"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
                className={inlineInputClass}
                placeholder="เช่น อาหารเสริม"
                autoFocus
              />
              <button type="button" onClick={addCategory} className={inlineSaveClass}>บันทึก</button>
              <button type="button" onClick={() => { setAddingCat(false); setNewCat('') }} className={inlineCancelClass}>ยกเลิก</button>
            </div>
          )}
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
