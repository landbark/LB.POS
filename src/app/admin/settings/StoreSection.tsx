'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Store, QrCode, Trash2 } from 'lucide-react'
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
    promptpay_id: config?.promptpay_id ?? '',
  })
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(config?.logo_url ?? null)

  // QR รับเงิน static (เช่น QR ของ K SHOP) — อัปโหลดตรงๆ ไม่ผ่าน crop/บีบอัด กันสแกนไม่ติด
  const qrFileRef = useRef<HTMLInputElement>(null)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState<string | null>(config?.payment_qr_url ?? null)

  function handleQrSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพ')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error('ไฟล์ใหญ่เกินไป (เกิน 3MB)')
      return
    }
    setQrFile(file)
    setQrPreview(URL.createObjectURL(file))
  }

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

    // อัปโหลด QR รับเงินใหม่ (ถ้ามี) ก่อนบันทึก
    let qrUrl = config.payment_qr_url
    if (qrFile) {
      const fd = new FormData()
      fd.append('file', qrFile)
      const res = await fetch('/api/store-payment-qr', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error('อัปโหลด QR ไม่สำเร็จ: ' + (data.error ?? ''))
        setLoading(false)
        return
      }
      qrUrl = data.url
    } else if (!qrPreview) {
      qrUrl = null
    }

    if (config.payment_qr_url && qrUrl !== config.payment_qr_url) {
      fetch('/api/store-payment-qr', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: config.payment_qr_url }),
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
        promptpay_id: form.promptpay_id.trim() || null,
        payment_qr_url: qrUrl,
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
    setQrFile(null)
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

        <div>
          <label className={labelClass}>PromptPay ID (ไม่บังคับ)</label>
          <input
            type="text" value={form.promptpay_id}
            onChange={(e) => set('promptpay_id', e.target.value)}
            className={inputClass} placeholder="เบอร์โทรหรือเลขบัตรประชาชนที่ผูก PromptPay"
          />
          <p className="text-xs text-gray-400 mt-1">
            ใช้สร้าง QR รับเงินอัตโนมัติที่จอลูกค้า (จอสอง) — ถ้าอัปโหลดรูป QR ด้านล่างไว้แล้ว ระบบจะใช้รูปนั้นก่อน
          </p>
        </div>

        <div>
          <label className={labelClass}>รูป QR รับเงิน (จอสอง)</label>
          <div className="flex items-center gap-3">
            {qrPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrPreview} alt="QR รับเงิน" className="w-20 h-20 rounded-lg object-contain border border-gray-200 bg-white" />
            ) : (
              <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300">
                <QrCode size={24} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => qrFileRef.current?.click()}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium text-left"
              >
                {qrPreview ? 'เปลี่ยนรูป' : 'เลือกรูป'}
              </button>
              {qrPreview && (
                <button
                  type="button"
                  onClick={() => { setQrFile(null); setQrPreview(null) }}
                  className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600"
                >
                  <Trash2 size={13} /> ลบรูป
                </button>
              )}
            </div>
            <input ref={qrFileRef} type="file" accept="image/*" onChange={handleQrSelect} className="hidden" />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            เช่น QR รับเงิน static ของ K SHOP / ธนาคาร — อัปโหลดรูปต้นฉบับตรงๆ ไม่ผ่านการย่อ/บีบอัด กันสแกนไม่ติด
            (QR แบบนี้ไม่มียอดเงินฝังไว้ ลูกค้าต้องพิมพ์ยอดเองตอนสแกน จอสองจะโชว์ยอดตัวใหญ่กำกับให้)
          </p>
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
