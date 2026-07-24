'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, ArrowLeft, CalendarPlus, Eye, Plus, Printer, Save, Send, Stethoscope, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { SPECIES_LABELS, VISIT_STATUS_LABELS, type PetVaccination, type Vaccine, type Visit, type VisitItem } from '@/lib/types'
import { petAge, petWarnings } from '@/lib/pets'
import { isClinicOnly, isVaccine } from '@/lib/clinic'
import { computeNextDue } from '@/lib/vaccines'
import VaccineSection from '@/app/admin/pets/[id]/VaccineSection'

interface DispensableProduct {
  id: string
  name: string
  unit: string
  price: number
  is_service: boolean
  clinic_only: boolean | null
  categories?: { name: string; clinic_only: boolean } | null
  product_lots?: { quantity: number }[]
}

interface HistoryEntry {
  id: string
  visit_number: string
  visit_date: string
  diagnosis: string | null
  treatment: string | null
  weight?: number | null
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

export default function VisitDetail({
  visit,
  products,
  history,
  previousWeight,
  userId,
  role,
  vaccinations,
  vaccines,
}: {
  visit: Visit
  products: DispensableProduct[]
  history: HistoryEntry[]
  previousWeight: { weight: number; date: string } | null
  userId: string
  role: string
  vaccinations: PetVaccination[]
  vaccines: Vaccine[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [makingAppt, setMakingAppt] = useState(false)
  const [form, setForm] = useState({
    weight: visit.weight?.toString() ?? '',
    temperature: visit.temperature?.toString() ?? '',
    heart_rate: visit.heart_rate?.toString() ?? '',
    resp_rate: visit.resp_rate?.toString() ?? '',
    symptoms: visit.symptoms ?? '',
    diagnosis: visit.diagnosis ?? '',
    treatment: visit.treatment ?? '',
    notes: visit.notes ?? '',
    follow_up_date: visit.follow_up_date ?? '',
  })
  const [productQuery, setProductQuery] = useState('')

  const pet = visit.pets
  const items = visit.visit_items ?? []

  // สิทธิ์แก้ไข:
  // - แคชเชียร์: ดูอย่างเดียว
  // - หมอ/แอดมิน: แก้ได้ ยกเว้นใบที่ "หมอคนอื่นกำลังตรวจ" (status=open + เจ้าของเป็นคนอื่น) และใบที่ยกเลิก
  // - ตรวจเสร็จแล้ว (pending_payment/paid): หมอคนไหนก็แก้บันทึกได้
  const examinedByOther = visit.status === 'open' && !!visit.vet_id && visit.vet_id !== userId
  const canEdit = (role === 'vet' || role === 'admin') && visit.status !== 'cancelled' && !examinedByOther
  const readOnly = !canEdit

  // ส่งไปเก็บเงินแล้วห้ามแก้รายการยา (ตะกร้าฝั่งแคชเชียร์อ่านจากตรงนี้) + ต้องมีสิทธิ์แก้
  const itemsLocked = readOnly || (visit.status !== 'open' && visit.status !== 'waiting')
  const warnings = pet ? petWarnings(pet) : []
  const total = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value))

  async function saveVisit(silent = false) {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('visits')
      .update({
        weight: numberOrNull(form.weight),
        temperature: numberOrNull(form.temperature),
        heart_rate: numberOrNull(form.heart_rate),
        resp_rate: numberOrNull(form.resp_rate),
        symptoms: form.symptoms.trim() || null,
        diagnosis: form.diagnosis.trim() || null,
        treatment: form.treatment.trim() || null,
        notes: form.notes.trim() || null,
        follow_up_date: form.follow_up_date || null,
      })
      .eq('id', visit.id)
    setSaving(false)

    if (error) {
      toast.error('บันทึกไม่สำเร็จ')
      return false
    }
    if (!silent) {
      toast.success('บันทึกแล้ว')
      router.refresh()
    }
    return true
  }

  async function addItem(product: DispensableProduct) {
    const supabase = createClient()
    const { error } = await supabase.from('visit_items').insert({
      visit_id: visit.id,
      product_id: product.id,
      quantity: 1,
      unit_price: product.price,
    })
    if (error) {
      toast.error('เพิ่มรายการไม่สำเร็จ')
      return
    }
    setProductQuery('')
    router.refresh()
  }

  async function updateItem(item: VisitItem, patch: Partial<Pick<VisitItem, 'quantity' | 'unit_price' | 'dosage'>>) {
    const supabase = createClient()
    const { error } = await supabase.from('visit_items').update(patch).eq('id', item.id)
    if (error) {
      toast.error('แก้ไขรายการไม่สำเร็จ')
      return
    }
    router.refresh()
  }

  async function removeItem(item: VisitItem) {
    const supabase = createClient()
    const { error } = await supabase.from('visit_items').delete().eq('id', item.id)
    if (error) {
      toast.error('ลบรายการไม่สำเร็จ')
      return
    }
    router.refresh()
  }

  // ส่งเข้าคิวเก็บเงิน — แคชเชียร์จะเห็นที่หน้าขายแล้วกดดึงเข้าตะกร้า
  async function sendToPayment() {
    if (items.length === 0) {
      toast.error('ยังไม่มีรายการยา/ค่าบริการให้เก็บเงิน')
      return
    }
    if (!await saveVisit(true)) return

    const supabase = createClient()

    // ลงประวัติวัคซีนอัตโนมัติสำหรับรายการที่เป็นวัคซีน (กันซ้ำด้วย visit_id + product_id)
    const vaccineItems = items.filter((i) => i.products && isVaccine(i.products as never))
    if (vaccineItems.length > 0) {
      const { data: existing } = await supabase
        .from('pet_vaccinations')
        .select('product_id')
        .eq('visit_id', visit.id)
        .not('product_id', 'is', null)
      const already = new Set((existing ?? []).map((e) => e.product_id))
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
      const rows = vaccineItems
        .filter((i) => !already.has(i.product_id))
        .map((i) => {
          const p = i.products as { name: string; booster_type?: string | null; booster_interval_days?: number | null }
          return {
            pet_id: visit.pet_id,
            vaccine_name: p.name,
            dose_date: today,
            next_due_date: computeNextDue(today, p.booster_type ?? null, p.booster_interval_days ?? null),
            vet_id: visit.vet_id,
            visit_id: visit.id,
            product_id: i.product_id,
            created_by: userId,
          }
        })
      if (rows.length > 0) await supabase.from('pet_vaccinations').insert(rows)
    }

    const { error } = await supabase
      .from('visits')
      .update({ status: 'pending_payment' })
      .eq('id', visit.id)

    if (error) {
      toast.error('ส่งไปเก็บเงินไม่สำเร็จ')
      return
    }
    toast.success('ส่งไปเก็บเงินแล้ว — แคชเชียร์จะเห็นที่หน้าขาย')
    router.refresh()
  }

  // สร้างนัดติดตามจากวันที่กรอกไว้ — บันทึกวันติดตามลง visit ด้วยกันเผื่อยังไม่ได้กดบันทึก
  async function createFollowUp() {
    if (!form.follow_up_date) return
    setMakingAppt(true)
    const supabase = createClient()
    // เที่ยงวันกันปัญหา timezone ขยับข้ามวัน
    const scheduled_at = new Date(`${form.follow_up_date}T09:00`).toISOString()
    const { error } = await supabase.from('appointments').insert({
      pet_id: visit.pet_id,
      customer_id: visit.customer_id,
      vet_id: visit.vet_id,
      scheduled_at,
      type: 'follow_up',
      notes: visit.diagnosis ? `ติดตามอาการ: ${visit.diagnosis}` : null,
      visit_id: visit.id,
      created_by: userId,
    })
    await supabase.from('visits').update({ follow_up_date: form.follow_up_date }).eq('id', visit.id)
    setMakingAppt(false)
    if (error) {
      toast.error('สร้างนัดไม่สำเร็จ')
      return
    }
    toast.success('สร้างนัดติดตามแล้ว — ดูได้ที่เมนูนัดหมาย')
    router.refresh()
  }

  // หมอเรียกตรวจจากคิว (เคสที่แคชเชียร์ลงทะเบียนไว้ให้)
  async function startExam() {
    const supabase = createClient()
    const { error } = await supabase
      .from('visits')
      .update({ status: 'open', vet_id: visit.vet_id ?? userId })
      .eq('id', visit.id)
    if (error) {
      toast.error('เริ่มตรวจไม่สำเร็จ')
      return
    }
    router.refresh()
  }

  // ยกเลิกเวชระเบียนที่เปิดผิด (เฉพาะที่ยังไม่เก็บเงิน) — เก็บ record ไว้แต่ mark เป็นยกเลิก
  async function cancelVisit() {
    if (!confirm('ยกเลิกเวชระเบียนใบนี้?\nใช้กรณีเปิดผิดตัว/ผิดคน — จะหลุดจากคิวและไม่นับเป็นการรักษา')) return
    const supabase = createClient()
    const { error } = await supabase.from('visits').update({ status: 'cancelled' }).eq('id', visit.id)
    if (error) {
      toast.error('ยกเลิกไม่สำเร็จ')
      return
    }
    toast.success('ยกเลิกเวชระเบียนแล้ว')
    router.push('/admin/visits')
  }

  async function backToOpen() {
    const supabase = createClient()
    const { error } = await supabase.from('visits').update({ status: 'open' }).eq('id', visit.id)
    if (error) {
      toast.error('ดึงกลับไม่สำเร็จ')
      return
    }
    toast.success('ดึงกลับมาแก้ไขแล้ว')
    router.refresh()
  }

  const weightDiff = previousWeight && form.weight.trim() !== ''
    ? Number(form.weight) - previousWeight.weight
    : null

  const pq = productQuery.trim().toLowerCase()
  const productMatches = pq
    ? products.filter((p) => p.name.toLowerCase().includes(pq)).slice(0, 8)
    : []

  const stockOf = (p: DispensableProduct) =>
    p.is_service ? null : (p.product_lots ?? []).reduce((s, l) => s + l.quantity, 0)

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/visits" className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 font-mono">{visit.visit_number}</h1>
            <p className="text-xs text-gray-500">
              {new Date(visit.visit_date).toLocaleString('th-TH', {
                day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
              })} น. · {visit.vet?.name ?? 'ไม่ระบุสัตวแพทย์'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/print/visit/${visit.id}`}
            target="_blank"
            className="flex items-center gap-1.5 border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            <Printer size={15} /> พิมพ์
          </a>
          {canEdit && (
            <button
              onClick={() => saveVisit()}
              disabled={saving}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Save size={15} /> {saving ? 'บันทึก...' : 'บันทึก'}
            </button>
          )}
        </div>
      </div>

      {/* แถบบอกโหมดดูอย่างเดียว */}
      {readOnly && (
        <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-gray-600">
          <Eye size={16} className="shrink-0" />
          {examinedByOther
            ? `${visit.vet?.name ?? 'สัตวแพทย์อีกท่าน'} กำลังตรวจอยู่ — ดูได้อย่างเดียว จนกว่าจะตรวจเสร็จ`
            : role === 'cashier'
              ? 'โหมดดูอย่างเดียว — แคชเชียร์ดูเวชระเบียนได้แต่แก้ไขไม่ได้'
              : visit.status === 'cancelled'
                ? 'เวชระเบียนนี้ถูกยกเลิกแล้ว'
                : 'ดูได้อย่างเดียว'}
        </div>
      )}

      {/* ข้อมูลสัตว์ + คำเตือน */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-gray-900">{pet?.name ?? '—'}</p>
            <p className="text-sm text-gray-500">
              {pet && SPECIES_LABELS[pet.species]}
              {pet?.breed && ` · ${pet.breed}`}
              {pet?.sex && ` · ${pet.sex === 'male' ? 'ผู้' : 'เมีย'}`}
              {pet && petAge(pet.birth_date) && ` · ${petAge(pet.birth_date)}`}
              {pet?.sterilized && ' · ทำหมันแล้ว'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              เจ้าของ: {visit.customers?.name ?? '—'}
              {visit.customers?.phone && <span className="font-mono text-gray-400"> {visit.customers.phone}</span>}
            </p>
          </div>
          <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
            visit.status === 'paid' ? 'bg-green-50 text-green-700'
              : visit.status === 'pending_payment' ? 'bg-amber-50 text-amber-700'
              : 'bg-blue-50 text-blue-700'
          }`}>
            {VISIT_STATUS_LABELS[visit.status]}
          </span>
        </div>

        {warnings.length > 0 && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">{warnings.join(' · ')}</p>
          </div>
        )}
      </div>

      {/* สัญญาณชีพ + บันทึกการตรวจ — ปิดทั้งชุดเมื่อดูอย่างเดียว */}
      <fieldset disabled={readOnly} className="contents">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">สัญญาณชีพ</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>น้ำหนัก (กก.)</label>
            <input type="number" step="0.01" value={form.weight} onChange={(e) => set('weight', e.target.value)} className={inputClass} />
            {previousWeight && (
              <p className="text-xs text-gray-400 mt-1">
                ครั้งก่อน {previousWeight.weight} กก.
                {weightDiff !== null && weightDiff !== 0 && (
                  <span className={weightDiff > 0 ? 'text-orange-600' : 'text-blue-600'}>
                    {' '}({weightDiff > 0 ? '+' : ''}{weightDiff.toFixed(2)})
                  </span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>อุณหภูมิ (°C)</label>
            <input type="number" step="0.1" value={form.temperature} onChange={(e) => set('temperature', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>ชีพจร (ครั้ง/นาที)</label>
            <input type="number" value={form.heart_rate} onChange={(e) => set('heart_rate', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>การหายใจ (ครั้ง/นาที)</label>
            <input type="number" value={form.resp_rate} onChange={(e) => set('resp_rate', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* บันทึกการตรวจ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 space-y-3">
        <div>
          <label className={labelClass}>อาการที่พามา</label>
          <textarea rows={2} value={form.symptoms} onChange={(e) => set('symptoms', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>การวินิจฉัย</label>
          <textarea rows={2} value={form.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>การรักษา / หัตถการ</label>
          <textarea rows={2} value={form.treatment} onChange={(e) => set('treatment', e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>หมายเหตุ</label>
            <input type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>นัดติดตามอาการ</label>
            <div className="flex items-center gap-2">
              <input type="date" value={form.follow_up_date} onChange={(e) => set('follow_up_date', e.target.value)} className={inputClass} />
              {form.follow_up_date && (
                <button
                  type="button"
                  onClick={createFollowUp}
                  disabled={makingAppt}
                  title="สร้างนัดติดตามจากวันนี้"
                  className="shrink-0 flex items-center gap-1 border border-gray-300 text-gray-600 text-xs px-2.5 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <CalendarPlus size={14} /> ตั้งนัด
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      </fieldset>

      {/* ยา / ค่าบริการ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">ยา / ค่าบริการที่จ่าย</h2>
          <p className="text-sm font-semibold text-gray-900">รวม ฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
        </div>

        {!itemsLocked && (
          <div className="relative mb-3">
            <div className="flex items-center gap-2">
              <Plus size={15} className="text-gray-400" />
              <input
                type="text"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="พิมพ์ชื่อยา / ค่าบริการ เพื่อเพิ่มรายการ..."
                className={inputClass}
              />
            </div>
            {productMatches.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {productMatches.map((p) => {
                  const stock = stockOf(p)
                  return (
                    <button
                      key={p.id}
                      onClick={() => addItem(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2"
                    >
                      <span>
                        {p.name}
                        {isClinicOnly(p) && <span className="ml-1.5 text-xs text-amber-600">ของคลินิก</span>}
                        {p.is_service && <span className="ml-1.5 text-xs text-gray-400">บริการ</span>}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">
                        ฿{p.price.toLocaleString('th-TH')} {stock !== null && `· เหลือ ${stock}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {pq && productMatches.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">ไม่พบสินค้า</p>
            )}
          </div>
        )}

        <table className="w-full">
          <thead className="border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 py-2">รายการ</th>
              <th className="text-left text-xs font-medium text-gray-500 py-2 w-56">วิธีใช้</th>
              <th className="text-center text-xs font-medium text-gray-500 py-2 w-20">จำนวน</th>
              <th className="text-right text-xs font-medium text-gray-500 py-2 w-24">ราคา</th>
              <th className="text-right text-xs font-medium text-gray-500 py-2 w-24">รวม</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="py-2 text-sm text-gray-900">{item.products?.name ?? 'สินค้าถูกลบแล้ว'}</td>
                <td className="py-2">
                  <input
                    type="text"
                    defaultValue={item.dosage ?? ''}
                    disabled={itemsLocked}
                    onBlur={(e) => {
                      const value = e.target.value.trim() || null
                      if (value !== (item.dosage ?? null)) updateItem(item, { dosage: value })
                    }}
                    placeholder="เช่น 1 เม็ด เช้า-เย็น หลังอาหาร"
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    min="1"
                    defaultValue={item.quantity}
                    disabled={itemsLocked}
                    onBlur={(e) => {
                      const value = parseInt(e.target.value)
                      if (value > 0 && value !== item.quantity) updateItem(item, { quantity: value })
                    }}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-center disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={item.unit_price}
                    disabled={itemsLocked}
                    onBlur={(e) => {
                      const value = parseFloat(e.target.value)
                      if (value >= 0 && value !== item.unit_price) updateItem(item, { unit_price: value })
                    }}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="py-2 text-sm text-right text-gray-900">
                  ฿{(item.unit_price * item.quantity).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2 text-right">
                  {!itemsLocked && (
                    <button onClick={() => removeItem(item)} className="p-1 text-gray-300 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-gray-400">ยังไม่มีรายการ</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* วัคซีน — บันทึกระหว่างตรวจได้เลย ผูกกับเวชระเบียนใบนี้ */}
      {pet && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <VaccineSection
            petId={visit.pet_id}
            species={pet.species}
            vaccinations={vaccinations}
            vaccines={vaccines}
            userId={userId}
            visitId={visit.id}
            readOnly={readOnly}
          />
        </div>
      )}

      {/* ส่งไปเก็บเงิน */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        {visit.status === 'waiting' && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-purple-700">
              ลงทะเบียนไว้แล้ว รอเรียกตรวจ{canEdit ? ' — กดเริ่มตรวจเพื่อรับเคสนี้' : ''}
            </p>
            {canEdit && (
              <button
                onClick={startExam}
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                <Stethoscope size={15} /> เริ่มตรวจ
              </button>
            )}
          </div>
        )}
        {visit.status === 'open' && (
          canEdit ? (
            <button
              onClick={sendToPayment}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors"
            >
              <Send size={18} /> ส่งไปเก็บเงิน (฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })})
            </button>
          ) : (
            <p className="text-sm text-gray-500">กำลังตรวจอยู่</p>
          )
        )}
        {visit.status === 'pending_payment' && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-amber-700">
              ส่งไปเก็บเงินแล้ว — รอแคชเชียร์ดึงเข้าตะกร้าที่หน้าขาย
            </p>
            {canEdit && (
              <button
                onClick={backToOpen}
                className="flex items-center gap-1.5 border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
              >
                <X size={15} /> ดึงกลับมาแก้ไข
              </button>
            )}
          </div>
        )}
        {visit.status === 'paid' && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-green-700">เก็บเงินเรียบร้อยแล้ว</p>
            {visit.transaction_id && (
              <a
                href={`/print/receipt/${visit.transaction_id}`}
                target="_blank"
                className="flex items-center gap-1.5 border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
              >
                <Printer size={15} /> ใบเสร็จ
              </a>
            )}
          </div>
        )}
      </div>

      {/* ประวัติการรักษาครั้งก่อน */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">ประวัติการรักษาของ {pet?.name}</h2>
          <div className="divide-y divide-gray-50">
            {history.map((h) => (
              <Link key={h.id} href={`/admin/visits/${h.id}`} className="block py-2 hover:bg-gray-50 rounded px-1">
                <p className="text-xs text-gray-400 font-mono">
                  {h.visit_number} · {new Date(h.visit_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                </p>
                <p className="text-sm text-gray-700">{h.diagnosis || h.treatment || 'ไม่ได้บันทึกการวินิจฉัย'}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ยกเลิกใบที่เปิดผิด — เฉพาะที่ยังไม่เก็บเงิน + มีสิทธิ์แก้ */}
      {canEdit && visit.status !== 'paid' && visit.status !== 'cancelled' && (
        <div className="text-center mt-6">
          <button onClick={cancelVisit} className="text-sm text-gray-400 hover:text-red-600">
            ยกเลิกเวชระเบียนใบนี้ (เปิดผิด)
          </button>
        </div>
      )}
    </div>
  )
}
