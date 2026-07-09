'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Store } from 'lucide-react'
import toast from 'react-hot-toast'
import ImageInput from '@/components/ImageInput'
import type { StoreSettings } from '@/lib/types'

export default function StoreSection({ config }: { config: StoreSettings | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: config?.name ?? '',
    address: config?.address ?? '',
    phone: config?.phone ?? '',
    tax_id: config?.tax_id ?? '',
  })
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(config?.logo_url ?? null)

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    setLoading(true)

    // อัปโหลดโลโก้ใหม่ (ถ้ามี) ก่อนบันทึก
    let logoUrl = config.logo_url
    if (logoBlob) {
      const fd = new FormData()
      fd.append('file', new File([logoBlob], 'logo', { type: logoBlob.type }))
      const res = await fetch('/api/store-logo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error('อัปโหลดโลโก้ไม่สำเร็จ: ' + (data.error ?? ''))
        setLoading(false)
        return
      }
      logoUrl = data.url
    } else if (!logoPreview) {
      logoUrl = null
    }

    if (config.logo_url && logoUrl !== config.logo_url) {
      fetch('/api/store-logo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: config.logo_url }),
      }).catch(() => {})
    }

    const supabase = createClient()
    const { error } = await supabase
      .from('store_settings')
      .update({
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        tax_id: form.tax_id.trim() || null,
        logo_url: logoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', config.id)

    setLoading(false)
    if (error) {
      toast.error('บันทึกไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success('บันทึกข้อมูลร้านแล้ว')
    setLogoBlob(null)
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Store size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">ข้อมูลร้าน</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        ใช้แสดงบนหัวเอกสาร เช่น ใบเสร็จรับเงินและใบสั่งซื้อ
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        <ImageInput
          label="โลโก้ร้าน"
          hint="รูปจะถูก crop สี่เหลี่ยมจัตุรัสและย่อขนาดอัตโนมัติ"
          preview={logoPreview}
          onChange={(blob, previewUrl) => {
            setLogoBlob(blob)
            setLogoPreview(previewUrl)
          }}
        />

        <div>
          <label className={labelClass}>ชื่อร้าน *</label>
          <input
            type="text" required value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputClass} placeholder="LANDBARK"
          />
        </div>

        <div>
          <label className={labelClass}>ที่อยู่</label>
          <textarea
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            className={inputClass} rows={2}
            placeholder="เลขที่ / ถนน / ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>เบอร์โทร</label>
            <input
              type="text" value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              className={inputClass} placeholder="08x-xxx-xxxx"
            />
          </div>
          <div>
            <label className={labelClass}>เลขผู้เสียภาษี (ไม่บังคับ)</label>
            <input
              type="text" value={form.tax_id}
              onChange={(e) => set('tax_id', e.target.value)}
              className={inputClass} placeholder="0-0000-00000-00-0"
            />
          </div>
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
