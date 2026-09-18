'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Store, Check, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { MarketplaceChannel, ProductMarketplaceLink } from '@/lib/types'

const PLATFORM_LABELS: Record<string, string> = { shopee: 'Shopee', tiktok: 'TikTok Shop', lazada: 'Lazada' }

export default function ProductMarketplaceLinks({
  productId,
  channels,
  links,
}: {
  productId: string
  channels: MarketplaceChannel[]
  links: ProductMarketplaceLink[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, { external_item_id: string; external_model_id: string }>>(() => {
    const initial: Record<string, { external_item_id: string; external_model_id: string }> = {}
    for (const l of links) {
      initial[l.channel_id] = { external_item_id: l.external_item_id, external_model_id: l.external_model_id ?? '' }
    }
    return initial
  })

  function setField(channelId: string, key: 'external_item_id' | 'external_model_id', value: string) {
    setForms((prev) => ({ ...prev, [channelId]: { ...(prev[channelId] ?? { external_item_id: '', external_model_id: '' }), [key]: value } }))
  }

  async function save(channelId: string) {
    const form = forms[channelId]
    if (!form?.external_item_id.trim()) {
      toast.error('กรุณาใส่รหัสสินค้า (item id) บนแพลตฟอร์มนั้น')
      return
    }
    setLoading(channelId)
    const supabase = createClient()
    const existing = links.find((l) => l.channel_id === channelId)
    const payload = {
      product_id: productId,
      channel_id: channelId,
      external_item_id: form.external_item_id.trim(),
      external_model_id: form.external_model_id.trim() || null,
    }
    const { error } = existing
      ? await supabase.from('product_marketplace_links').update(payload).eq('id', existing.id)
      : await supabase.from('product_marketplace_links').insert(payload)
    setLoading(null)
    if (error) {
      toast.error('บันทึกไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success('บันทึกแล้ว')
    router.refresh()
  }

  async function remove(link: ProductMarketplaceLink) {
    if (!confirm('ลบการจับคู่นี้?')) return
    setLoading(link.channel_id)
    const supabase = createClient()
    const { error } = await supabase.from('product_marketplace_links').delete().eq('id', link.id)
    setLoading(null)
    if (error) {
      toast.error('ลบไม่สำเร็จ')
      return
    }
    toast.success('ลบแล้ว')
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  if (channels.length === 0) {
    return null
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Store size={18} className="text-gray-400" />
        <h2 className="font-semibold text-gray-900">ช่องทางขายออนไลน์</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">จับคู่สินค้านี้กับรหัสสินค้าบน Shopee/TikTok เพื่อตัดสต็อคอัตโนมัติในอนาคต</p>

      <div className="space-y-3">
        {channels.map((c) => {
          const link = links.find((l) => l.channel_id === c.id) ?? null
          const form = forms[c.id] ?? { external_item_id: '', external_model_id: '' }
          return (
            <div key={c.id} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-900">{PLATFORM_LABELS[c.platform] ?? c.platform}</p>
                {!c.connected && (
                  <span className="text-xs text-amber-600">ยังไม่ได้เชื่อมต่อร้าน — ตั้งค่าได้ที่หน้าตั้งค่า</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Item ID</label>
                  <input
                    type="text"
                    value={form.external_item_id}
                    onChange={(e) => setField(c.id, 'external_item_id', e.target.value)}
                    className={inputClass}
                    placeholder="รหัสสินค้าบนแพลตฟอร์ม"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Model ID (ถ้ามีตัวเลือกสินค้า)</label>
                  <input
                    type="text"
                    value={form.external_model_id}
                    onChange={(e) => setField(c.id, 'external_model_id', e.target.value)}
                    className={inputClass}
                    placeholder="ไม่บังคับ"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => save(c.id)}
                  disabled={loading === c.id}
                  className="flex items-center gap-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg"
                >
                  <Check size={13} /> บันทึก
                </button>
                {link && (
                  <button
                    onClick={() => remove(link)}
                    disabled={loading === c.id}
                    className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 px-2 py-1.5"
                  >
                    <Trash2 size={13} /> ลบ
                  </button>
                )}
              </div>
              {link?.last_synced_at && (
                <p className="text-xs text-gray-400 mt-1.5">
                  ซิงค์ล่าสุด {new Date(link.last_synced_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} — สต็อค {link.last_synced_stock ?? '—'}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
