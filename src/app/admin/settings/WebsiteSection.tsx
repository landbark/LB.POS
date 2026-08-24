'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Globe } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import type { StoreSettings } from '@/lib/types'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

export default function WebsiteSection({ config }: { config: StoreSettings | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    line_url: config?.line_url ?? '',
    facebook_url: config?.facebook_url ?? '',
    instagram_url: config?.instagram_url ?? '',
    shop_enabled: config?.shop_enabled ?? false,
    shop_intro: config?.shop_intro ?? '',
    pickup_note: config?.pickup_note ?? '',
    free_shipping_min: config?.free_shipping_min?.toString() ?? '',
  })

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase
      .from('store_settings')
      .update({
        line_url: form.line_url.trim() || null,
        facebook_url: form.facebook_url.trim() || null,
        instagram_url: form.instagram_url.trim() || null,
        shop_enabled: form.shop_enabled,
        shop_intro: form.shop_intro.trim() || null,
        pickup_note: form.pickup_note.trim() || null,
        free_shipping_min: form.free_shipping_min.trim() ? parseFloat(form.free_shipping_min) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', config.id)

    setLoading(false)
    if (error) {
      toast.error('บันทึกไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success('บันทึกการตั้งค่าเว็บแล้ว')
    router.refresh()
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Globe size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">เว็บร้าน & ช่องทางติดต่อ</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        ใช้กับหน้าเว็บสาธารณะ (หน้าแรก ข่าวสาร และร้านค้าออนไลน์)
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        <div>
          <label className={labelClass}>ลิงก์ LINE</label>
          <input
            type="url" value={form.line_url}
            onChange={(e) => set('line_url', e.target.value)}
            className={inputClass} placeholder="https://lin.ee/xxxxxxx"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>ลิงก์ Facebook</label>
            <input
              type="url" value={form.facebook_url}
              onChange={(e) => set('facebook_url', e.target.value)}
              className={inputClass} placeholder="https://facebook.com/..."
            />
          </div>
          <div>
            <label className={labelClass}>ลิงก์ Instagram</label>
            <input
              type="url" value={form.instagram_url}
              onChange={(e) => set('instagram_url', e.target.value)}
              className={inputClass} placeholder="https://instagram.com/..."
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>ข้อความแนะนำร้าน (หน้าแรก)</label>
          <textarea
            value={form.shop_intro}
            onChange={(e) => set('shop_intro', e.target.value)}
            className={inputClass} rows={3}
            placeholder="ร้านเพทชอปและคลินิกรักษาสัตว์ เปิดทุกวัน 9:00-20:00"
          />
        </div>

        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={form.shop_enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, shop_enabled: e.target.checked }))}
              className="w-4 h-4 accent-blue-600"
            />
            เปิดร้านค้าออนไลน์ (ให้ลูกค้าสั่งซื้อเองบนเว็บ)
          </label>
          <p className="text-xs text-gray-500">
            ปิดอยู่ = เว็บโชว์แค่ข่าวสารและช่องทางติดต่อ · สินค้าที่จะขึ้นเว็บต้องติ๊ก &ldquo;ขายบนเว็บ&rdquo; ในหน้าสินค้าและใส่น้ำหนักด้วย
          </p>

          {form.shop_enabled && (
            <>
              <div>
                <label className={labelClass}>ข้อความเรื่องการมารับที่ร้าน</label>
                <textarea
                  value={form.pickup_note}
                  onChange={(e) => set('pickup_note', e.target.value)}
                  className={inputClass} rows={2}
                  placeholder="สั่งแล้วรอร้านยืนยัน มารับได้ที่ร้านทุกวัน 9:00-20:00"
                />
              </div>
              <div className="w-56">
                <label className={labelClass}>ซื้อครบเท่าไหร่ส่งฟรี (บาท)</label>
                <input
                  type="number" min="0" step="1" value={form.free_shipping_min}
                  onChange={(e) => set('free_shipping_min', e.target.value)}
                  className={inputClass} placeholder="เว้นว่าง = ไม่มีส่งฟรี"
                />
              </div>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !config}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
        >
          {loading ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </form>
    </section>
  )
}
