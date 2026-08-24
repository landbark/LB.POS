'use client'

import { useState } from 'react'
import { MapPin, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { PROVINCES } from '@/lib/provinces'
import { formatAddress } from '@/lib/shop'
import type { CustomerAddress } from '@/lib/types'

const inputClass =
  'w-full rounded-lg border border-brand-muted/40 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-brown/40'

const emptyForm = {
  label: '',
  recipient_name: '',
  phone: '',
  address_line: '',
  subdistrict: '',
  district: '',
  province: '',
  postal_code: '',
  is_default: false,
}

export default function AddressBook({ initialAddresses }: { initialAddresses: CustomerAddress[] }) {
  const [addresses, setAddresses] = useState(initialAddresses)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function save() {
    setSaving(true)
    const res = await fetch('/api/shop/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      toast.error(data.error ?? 'บันทึกที่อยู่ไม่สำเร็จ')
      return
    }
    setAddresses([data.address, ...addresses.map((a) => (form.is_default ? { ...a, is_default: false } : a))])
    setForm(emptyForm)
    setAdding(false)
    toast.success('บันทึกที่อยู่แล้ว')
  }

  async function remove(id: string) {
    if (!confirm('ลบที่อยู่นี้?')) return
    const res = await fetch(`/api/shop/addresses?id=${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('ลบไม่สำเร็จ')
      return
    }
    setAddresses(addresses.filter((a) => a.id !== id))
  }

  return (
    <section className="rounded-xl bg-white border border-brand-muted/30 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-brand-dark">ที่อยู่จัดส่ง</h2>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="inline-flex items-center gap-1 text-sm text-brand-brown font-medium"
        >
          <Plus size={14} /> เพิ่มที่อยู่
        </button>
      </div>

      {addresses.length === 0 && !adding && (
        <p className="mt-3 text-sm text-gray-400">ยังไม่มีที่อยู่บันทึกไว้</p>
      )}

      <div className="mt-3 space-y-2">
        {addresses.map((address) => (
          <div key={address.id} className="flex gap-3 rounded-lg border border-brand-muted/20 p-3">
            <MapPin size={16} className="mt-0.5 text-brand-brown shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-dark">
                {address.label && <span className="text-brand-brown">{address.label} · </span>}
                {address.recipient_name} · {address.phone}
                {address.is_default && (
                  <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-brand-light text-brand-brown">ค่าเริ่มต้น</span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{formatAddress(address)}</p>
            </div>
            <button
              type="button"
              onClick={() => remove(address.id)}
              className="p-1.5 text-gray-400 hover:text-red-600"
              aria-label="ลบที่อยู่"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className={inputClass}
            placeholder="ชื่อเรียก (บ้าน / ที่ทำงาน)"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="ชื่อผู้รับ *"
            value={form.recipient_name}
            onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="เบอร์โทร *"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="รหัสไปรษณีย์"
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
          <textarea
            className={`${inputClass} sm:col-span-2`}
            rows={2}
            placeholder="บ้านเลขที่ / หมู่บ้าน / ถนน *"
            value={form.address_line}
            onChange={(e) => setForm({ ...form, address_line: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="ตำบล / แขวง"
            value={form.subdistrict}
            onChange={(e) => setForm({ ...form, subdistrict: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="อำเภอ / เขต"
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
          />
          <select
            className={inputClass}
            value={form.province}
            onChange={(e) => setForm({ ...form, province: e.target.value })}
          >
            <option value="">เลือกจังหวัด *</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              className="w-4 h-4 accent-[#C4865A]"
            />
            ตั้งเป็นที่อยู่หลัก
          </label>

          <div className="sm:col-span-2 flex gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="flex-1 py-2.5 rounded-xl bg-brand-brown text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกที่อยู่'}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setForm(emptyForm) }}
              className="px-4 py-2.5 rounded-xl border border-brand-muted/40 text-sm text-gray-600"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
