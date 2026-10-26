'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Edit, Trash2, X, Check, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Promotion, Category, PromotionType, ApplyTo, AmountMode, ChannelScope } from '@/lib/types'
import { describeDiscount, describeCondition, promotionExpired, CHANNEL_SCOPE_LABEL } from '@/lib/promotions'
import { confirmDialog } from '@/lib/confirm'
import MultiPicker from '@/components/MultiPicker'

interface ProductOption {
  id: string
  name: string
  sku: string | null
  category: string | null
  /** SKU + บาร์โค้ด (รวมของหน่วยย่อย) ไว้ให้ค้นหาเจอ */
  codes: string
}

const emptyForm = {
  name: '',
  type: 'percent_discount' as PromotionType,
  discount_percent: '',
  discount_amount: '',
  amount_mode: 'per_unit' as AmountMode,
  buy_quantity: '',
  get_quantity: '',
  min_quantity: '',
  min_amount: '',
  max_discount: '',
  apply_to: 'all' as ApplyTo,
  channel_scope: 'all' as ChannelScope,
  category_ids: [] as string[],
  product_ids: [] as string[],
  start_date: new Date().toISOString().split('T')[0],
  end_date: new Date().toISOString().split('T')[0],
  active: true,
}

const SCOPE_BADGE: Record<ChannelScope, string> = {
  all: 'bg-gray-100 text-gray-600',
  store: 'bg-blue-100 text-blue-700',
  // สีเดียวกับ badge ช่องทาง "ออกบูธ" ในตารางบิล (lib/salesChannel)
  booth: 'bg-amber-100 text-amber-800',
}

const todayStr = () => new Date().toISOString().split('T')[0]
const numOrNull = (s: string) => (s.trim() === '' || parseFloat(s) <= 0 ? null : parseFloat(s))
const intOrNull = (s: string) => (s.trim() === '' || parseInt(s, 10) <= 0 ? null : parseInt(s, 10))

function describeScope(p: Promotion, categories: Category[], products: ProductOption[]) {
  if (p.apply_to === 'all') return 'ทุกสินค้า'

  const names = p.apply_to === 'categories'
    ? p.category_ids.map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean)
    : p.product_ids.map((id) => products.find((pr) => pr.id === id)?.name).filter(Boolean)

  const label = p.apply_to === 'categories' ? 'หมวด' : 'สินค้า'
  if (names.length === 0) return `${label}: —`
  // ลิสต์ยาวๆ ในตารางอ่านไม่รู้เรื่อง เอาสองชื่อแรกพอ ที่เหลือบอกจำนวน
  if (names.length <= 2) return `${label}: ${names.join(', ')}`
  return `${label}: ${names.slice(0, 2).join(', ')} +${names.length - 2} รายการ`
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
      discount_amount: p.discount_amount?.toString() ?? '',
      amount_mode: p.amount_mode ?? 'per_unit',
      buy_quantity: p.buy_quantity?.toString() ?? '',
      get_quantity: p.get_quantity?.toString() ?? '',
      min_quantity: p.min_quantity?.toString() ?? '',
      min_amount: p.min_amount?.toString() ?? '',
      max_discount: p.max_discount?.toString() ?? '',
      apply_to: p.apply_to,
      channel_scope: p.channel_scope,
      category_ids: p.category_ids,
      product_ids: p.product_ids,
      start_date: p.start_date,
      end_date: p.end_date ?? '',
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
    if (form.type === 'percent_discount' && !numOrNull(form.discount_percent)) {
      toast.error('กรุณาใส่เปอร์เซ็นต์ส่วนลด')
      return
    }
    if (form.type === 'amount_discount' && !numOrNull(form.discount_amount)) {
      toast.error('กรุณาใส่จำนวนเงินที่ลด')
      return
    }
    if (form.type === 'buy_x_get_y' && (!intOrNull(form.buy_quantity) || !intOrNull(form.get_quantity))) {
      toast.error('กรุณาใส่จำนวนซื้อและแถม')
      return
    }
    if (form.apply_to === 'categories' && form.category_ids.length === 0) {
      toast.error('กรุณาเลือกหมวดหมู่อย่างน้อย 1 หมวด')
      return
    }
    if (form.apply_to === 'products' && form.product_ids.length === 0) {
      toast.error('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ')
      return
    }
    // วันสิ้นสุดเว้นว่างได้ = ไม่มีวันหมด เทียบวันก็เฉพาะตอนที่กรอกมา
    if (form.end_date && form.start_date > form.end_date) {
      toast.error('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const isPercent = form.type === 'percent_discount'
    const isAmount = form.type === 'amount_discount'
    const isBuyGet = form.type === 'buy_x_get_y'

    const payload = {
      name: form.name.trim(),
      type: form.type,
      discount_percent: isPercent ? numOrNull(form.discount_percent) : null,
      discount_amount: isAmount ? numOrNull(form.discount_amount) : null,
      amount_mode: isAmount ? form.amount_mode : 'per_unit',
      buy_quantity: isBuyGet ? intOrNull(form.buy_quantity) : null,
      get_quantity: isBuyGet ? intOrNull(form.get_quantity) : null,
      // ซื้อ X แถม Y มีจำนวนในตัวเองอยู่แล้ว ไม่ต้องมีเงื่อนไขซ้อน
      min_quantity: isBuyGet ? null : intOrNull(form.min_quantity),
      min_amount: isBuyGet ? null : numOrNull(form.min_amount),
      max_discount: isPercent ? numOrNull(form.max_discount) : null,
      apply_to: form.apply_to,
      channel_scope: form.channel_scope,
      start_date: form.start_date,
      end_date: form.end_date || null,
      active: form.active,
    }

    const { data, error } = editingId
      ? await supabase.from('promotions').update(payload).eq('id', editingId).select('id').single()
      : await supabase.from('promotions').insert(payload).select('id').single()

    if (error || !data) {
      setLoading(false)
      toast.error('เกิดข้อผิดพลาด: ' + (error?.message ?? 'บันทึกไม่สำเร็จ'))
      return
    }

    // ขอบเขตเก็บในตารางเชื่อม — ล้างของเดิมแล้วใส่ชุดใหม่ ง่ายกว่าไล่เทียบว่าอะไรเพิ่ม/อะไรหาย
    const scopeError = await replaceScope(supabase, data.id, form)
    setLoading(false)
    if (scopeError) {
      toast.error('บันทึกขอบเขตไม่สำเร็จ: ' + scopeError)
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
              target="_blank"
              rel="noopener noreferrer"
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
    if (!(await confirmDialog({ message: `ลบโปรโมชั่น "${p.name}" ?` })).confirmed) return
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
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'
  const today = todayStr()

  const formCard = (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={labelClass}>ชื่อโปรโมชั่น *</label>
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} placeholder="เช่น ลดหน้าร้อน 10%" autoFocus />
        </div>

        <div>
          <label className={labelClass}>ประเภทส่วนลด *</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value as PromotionType)} className={inputClass}>
            <option value="percent_discount">ลดเป็นเปอร์เซ็นต์</option>
            <option value="amount_discount">ลดเป็นจำนวนเงิน</option>
            <option value="buy_x_get_y">ซื้อ X แถม Y</option>
          </select>
        </div>

        {form.type === 'percent_discount' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>ลดกี่เปอร์เซ็นต์ *</label>
              <input
                type="number" min={0.01} max={100} step="0.01"
                value={form.discount_percent}
                onChange={(e) => set('discount_percent', e.target.value)}
                className={inputClass}
                placeholder="10"
              />
            </div>
            <div>
              <label className={labelClass}>ลดสูงสุด (บาท)</label>
              <input
                type="number" min={0} step="0.01"
                value={form.max_discount}
                onChange={(e) => set('max_discount', e.target.value)}
                className={inputClass}
                placeholder="ไม่จำกัด"
              />
            </div>
          </div>
        )}

        {form.type === 'amount_discount' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>ลดกี่บาท *</label>
              <input
                type="number" min={0.01} step="0.01"
                value={form.discount_amount}
                onChange={(e) => set('discount_amount', e.target.value)}
                className={inputClass}
                placeholder="20"
              />
            </div>
            <div>
              <label className={labelClass}>ลดแบบ *</label>
              <select value={form.amount_mode} onChange={(e) => set('amount_mode', e.target.value as AmountMode)} className={inputClass}>
                <option value="per_unit">ต่อชิ้น</option>
                <option value="per_line">ต่อรายการ</option>
              </select>
            </div>
          </div>
        )}

        {form.type === 'buy_x_get_y' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>ซื้อ *</label>
              <input type="number" min={1} value={form.buy_quantity} onChange={(e) => set('buy_quantity', e.target.value)} className={inputClass} placeholder="2" />
            </div>
            <div>
              <label className={labelClass}>แถม *</label>
              <input type="number" min={1} value={form.get_quantity} onChange={(e) => set('get_quantity', e.target.value)} className={inputClass} placeholder="1" />
            </div>
          </div>
        )}

        {form.type === 'amount_discount' && (
          <p className="sm:col-span-2 text-xs text-gray-500 -mt-1">
            {form.amount_mode === 'per_unit'
              ? 'ต่อชิ้น = ซื้อ 3 ชิ้นลด 3 เท่า (นับเป็นหน่วยย่อย ซื้อยกกล่องลดตามจำนวนชิ้นในกล่อง)'
              : 'ต่อรายการ = ลดครั้งเดียวต่อสินค้าหนึ่งบรรทัดในบิล ไม่ว่าจะซื้อกี่ชิ้น'}
          </p>
        )}

        {/* เงื่อนไข "ซื้อครบ" — ซื้อ X แถม Y มีจำนวนในตัวเองแล้ว */}
        {form.type !== 'buy_x_get_y' && (
          <div className="sm:col-span-2 border border-gray-200 bg-white rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">เงื่อนไข — ลดเมื่อซื้อครบ (เว้นว่าง = ลดทันที)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>ซื้อครบกี่ชิ้น</label>
                <input
                  type="number" min={1}
                  value={form.min_quantity}
                  onChange={(e) => set('min_quantity', e.target.value)}
                  className={inputClass}
                  placeholder="ไม่กำหนด"
                />
              </div>
              <div>
                <label className={labelClass}>ยอดรายการครบกี่บาท</label>
                <input
                  type="number" min={0} step="0.01"
                  value={form.min_amount}
                  onChange={(e) => set('min_amount', e.target.value)}
                  className={inputClass}
                  placeholder="ไม่กำหนด"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              นับต่อสินค้าหนึ่งบรรทัดในบิล (ชิ้นนับเป็นหน่วยย่อย — ซื้อยกกล่องนับซองในกล่องให้ด้วย)
              {form.min_quantity && form.min_amount && ' · ใส่ทั้งสองช่อง = ต้องครบทั้งคู่'}
            </p>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className={labelClass}>ใช้กับ *</label>
          <select value={form.apply_to} onChange={(e) => set('apply_to', e.target.value as ApplyTo)} className={inputClass}>
            <option value="all">ทุกสินค้า</option>
            <option value="categories">เฉพาะหมวดหมู่ (เลือกได้หลายหมวด)</option>
            <option value="products">เฉพาะสินค้า (เลือกได้หลายรายการ)</option>
          </select>
        </div>

        {form.apply_to === 'categories' && (
          <div className="sm:col-span-2">
            <label className={labelClass}>หมวดหมู่ *</label>
            <MultiPicker
              options={categories.map((c) => ({ id: c.id, name: c.name }))}
              selected={form.category_ids}
              onChange={(ids) => set('category_ids', ids)}
              placeholder="ค้นหาหมวดหมู่..."
              emptyLabel="ยังไม่ได้เลือกหมวดหมู่"
            />
          </div>
        )}

        {form.apply_to === 'products' && (
          <div className="sm:col-span-2">
            <label className={labelClass}>สินค้า *</label>
            <MultiPicker
              options={products.map((p) => ({
                id: p.id,
                name: p.name,
                hint: [p.sku, p.category].filter(Boolean).join(' · ') || null,
                keywords: p.codes,
              }))}
              selected={form.product_ids}
              onChange={(ids) => set('product_ids', ids)}
              placeholder="ค้นหาชื่อ / SKU / บาร์โค้ด..."
              emptyLabel="ยังไม่ได้เลือกสินค้า"
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className={labelClass}>ใช้ที่ไหน *</label>
          <select value={form.channel_scope} onChange={(e) => set('channel_scope', e.target.value as ChannelScope)} className={inputClass}>
            <option value="all">ทุกที่ (หน้าร้าน + งานออกบูธ)</option>
            <option value="store">หน้าร้านเท่านั้น</option>
            <option value="booth">งานออกบูธเท่านั้น</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {form.channel_scope === 'booth'
              ? 'เด้งเฉพาะตอนแคชเชียร์เปิดโหมดบูธในหน้าขาย — ใช้ได้ทุกรอบที่ออกบูธ ไม่ต้องสร้างใหม่'
              : form.channel_scope === 'store'
                ? 'ไม่เด้งตอนขายที่งาน — ที่งานใช้ราคาบูธซึ่งลดมาแล้ว'
                : 'ลดทั้งที่ร้านและที่งานออกบูธ (ที่งานคิดจากราคาบูธ)'}
          </p>
        </div>

        <div>
          <label className={labelClass}>วันที่เริ่ม *</label>
          <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>วันที่สิ้นสุด</label>
          <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} className={inputClass} />
          <p className="text-xs text-gray-500 mt-1">
            {form.end_date
              ? form.channel_scope === 'booth'
                ? 'โปรบูธที่ใช้ทุกรอบ ลบวันนี้ออกได้ — จะไม่มีวันหมด ไม่ต้องมาต่ออายุทุกเดือน'
                : 'ถึงวันนี้แล้วหยุดลดเอง'
              : 'ไม่มีวันหมด — ลดไปเรื่อยๆ จนกดปิดใช้งาน'}
          </p>
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

      <p className="text-xs text-gray-500 mb-3">
        สินค้าหนึ่งชิ้นเข้าหลายโปรพร้อมกัน = หน้าขายเลือกโปรที่ลดเยอะที่สุดให้ (ไม่ลดซ้อนกัน)
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ชื่อ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ส่วนลด</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เงื่อนไข</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ใช้กับ</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ใช้ที่ไหน</th>
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
                    <td colSpan={8} className="px-4 py-3">{formCard}</td>
                  </tr>
                )
              }
              const condition = describeCondition(p)
              const expired = promotionExpired(p, today)
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{describeDiscount(p)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {condition || <span className="text-gray-300">ลดทันที</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{describeScope(p, categories, products)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SCOPE_BADGE[p.channel_scope]}`}>
                      {CHANNEL_SCOPE_LABEL[p.channel_scope]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {p.end_date ? `${p.start_date} - ${p.end_date}` : `${p.start_date} - ไม่มีวันหมด`}
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
                        target="_blank"
                        rel="noopener noreferrer"
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
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
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

/** เขียนขอบเขตใหม่ทั้งชุด — คืน message ถ้าพลาด */
async function replaceScope(
  supabase: ReturnType<typeof createClient>,
  promotionId: string,
  form: typeof emptyForm,
): Promise<string | null> {
  const [{ error: delProducts }, { error: delCategories }] = await Promise.all([
    supabase.from('promotion_products').delete().eq('promotion_id', promotionId),
    supabase.from('promotion_categories').delete().eq('promotion_id', promotionId),
  ])
  if (delProducts || delCategories) return (delProducts ?? delCategories)!.message

  if (form.apply_to === 'products' && form.product_ids.length > 0) {
    const { error } = await supabase
      .from('promotion_products')
      .insert(form.product_ids.map((product_id) => ({ promotion_id: promotionId, product_id })))
    if (error) return error.message
  }

  if (form.apply_to === 'categories' && form.category_ids.length > 0) {
    const { error } = await supabase
      .from('promotion_categories')
      .insert(form.category_ids.map((category_id) => ({ promotion_id: promotionId, category_id })))
    if (error) return error.message
  }

  return null
}
