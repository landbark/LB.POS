'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Store, QrCode, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import ImageInput from '@/components/ImageInput'
import type { StoreSettings, RoundingMode } from '@/lib/types'
import { ROUNDING_OPTIONS } from '@/lib/rounding'
import { DENOMS, SUGGESTED_FLOAT } from '@/lib/shiftFloat'

export default function StoreSection({ config }: { config: StoreSettings | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: config?.name ?? '',
    address: config?.address ?? '',
    phone: config?.phone ?? '',
    tax_id: config?.tax_id ?? '',
    promptpay_id: config?.promptpay_id ?? '',
    vat_registered: config?.vat_registered ?? false,
    vat_rate: config?.vat_rate?.toString() ?? '7',
    rounding_mode: (config?.rounding_mode ?? 'none') as RoundingMode,
  })
  // เงินทอนตั้งต้นแยกรายชนิด — ว่างทุกช่อง = ไม่ใช้ (เก๊ะยกยอดที่เหลือจริงไปเหมือนเดิม)
  const [floatCounts, setFloatCounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(DENOMS.map((d) => [d.value, config?.float_denoms?.[d.value]?.toString() ?? ''])),
  )
  const floatQty = (v: number) => parseInt(floatCounts[v] || '0', 10) || 0
  const floatTotal = DENOMS.reduce((sum, d) => sum + d.value * floatQty(d.value), 0)
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
        vat_registered: form.vat_registered,
        vat_rate: parseFloat(form.vat_rate) || 7,
        promptpay_id: form.promptpay_id.trim() || null,
        rounding_mode: form.rounding_mode,
        float_target: floatTotal > 0 ? floatTotal : null,
        float_denoms: floatTotal > 0
          ? Object.fromEntries(DENOMS.filter((d) => floatQty(d.value) > 0).map((d) => [d.value, floatQty(d.value)]))
          : null,
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

        {/* ปิดไว้จนกว่าจะจดทะเบียนจริง — ออกใบกำกับภาษีทั้งที่ยังไม่จดทะเบียนผิดกฎหมาย */}
        <div className="border border-gray-200 rounded-lg p-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={form.vat_registered}
              onChange={(e) => setForm((prev) => ({ ...prev, vat_registered: e.target.checked }))}
              className="w-4 h-4 accent-blue-600"
            />
            ร้านจดทะเบียน VAT แล้ว
          </label>
          <p className="text-xs text-gray-500 mt-1.5">
            ปิดอยู่ = ระบบจะเก็บแค่ข้อมูลว่าสินค้าไหนเข้าข่าย VAT ไม่บวกเงินเพิ่มและไม่พิมพ์ VAT ลงใบเสร็จ
            {' '}<span className="text-amber-600">เปิดเมื่อจดทะเบียนกับสรรพากรเรียบร้อยแล้วเท่านั้น</span>
          </p>
          {form.vat_registered && (
            <div className="mt-3 w-40">
              <label className={labelClass}>อัตรา VAT (%)</label>
              <input
                type="number" min="0" max="100" step="0.01" value={form.vat_rate}
                onChange={(e) => set('vat_rate', e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>ปัดเศษสตางค์ท้ายบิล</label>
          <div className="space-y-1.5 mb-4">
            {ROUNDING_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  className="mt-1"
                  checked={form.rounding_mode === opt.value}
                  onChange={() => setForm({ ...form, rounding_mode: opt.value })}
                />
                <span>
                  {opt.label}
                  <span className="block text-xs text-gray-400">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between mb-1">
            <label className={labelClass + ' mb-0'}>เงินทอนตั้งต้นคงที่ (ไม่บังคับ)</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFloatCounts(Object.fromEntries(
                  DENOMS.map((d) => [d.value, SUGGESTED_FLOAT[d.value] ? String(SUGGESTED_FLOAT[d.value]) : '']),
                ))}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                ใช้ชุดแนะนำ
              </button>
              {floatTotal > 0 && (
                <button
                  type="button"
                  onClick={() => setFloatCounts(Object.fromEntries(DENOMS.map((d) => [d.value, ''])))}
                  className="text-xs font-medium text-gray-400 hover:text-gray-600"
                >
                  ล้าง
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-2">
            {DENOMS.map((d) => (
              <div key={d.value} className="flex items-center gap-2">
                <span className="text-sm text-gray-600 w-[5.5rem] shrink-0">{d.label}</span>
                <input
                  type="number" min={0} step={1} inputMode="numeric"
                  value={floatCounts[d.value] ?? ''}
                  onChange={(e) => setFloatCounts((c) => ({ ...c, [d.value]: e.target.value }))}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
                <span className={`text-sm text-right flex-1 tabular-nums ${floatQty(d.value) > 0 ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                  ฿{(d.value * floatQty(d.value)).toLocaleString('th-TH')}
                </span>
              </div>
            ))}
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1.5">
            รวมเงินทอน ฿{floatTotal.toLocaleString('th-TH')}
            {floatTotal === 0 && <span className="font-normal text-gray-400"> — เว้นว่างทุกช่อง = ไม่ใช้</span>}
          </p>
          <p className="text-xs text-gray-500 mb-4">
            ตั้งไว้แล้วตอนปิดกะระบบจะบอกว่าต้องหยิบแบงค์ไหนออกให้เจ้าของกี่ใบ ถึงจะเหลือเงินทอนตามนี้
            และบอกด้วยว่ากองไหนขาด ต้องแลกมาเติมก่อนเปิดร้าน ·{' '}
            <span className="text-gray-400">
              กำหนดทีละชนิดเพราะยอดรวมอย่างเดียวไม่พอ — เหลือ ฿3,000 ที่เป็นแบงค์ร้อยล้วนก็ทอนไม่ได้สักบาท
            </span>
          </p>

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
