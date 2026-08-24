'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Truck, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { PROVINCES } from '@/lib/provinces'
import { formatWeight } from '@/lib/shop'
import type { ShippingZoneWithRates } from '@/lib/types'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function ShippingSection({ initialZones }: { initialZones: ShippingZoneWithRates[] }) {
  const router = useRouter()
  const [zones, setZones] = useState(initialZones)
  const [newZone, setNewZone] = useState('')
  const [busy, setBusy] = useState(false)

  const supabase = createClient()

  function replaceZone(zone: ShippingZoneWithRates) {
    setZones((prev) => prev.map((z) => (z.id === zone.id ? zone : z)))
  }

  async function addZone() {
    const name = newZone.trim()
    if (!name) return
    setBusy(true)
    const { data, error } = await supabase
      .from('shipping_zones')
      .insert({ name, provinces: [], sort_order: zones.length + 1 })
      .select('*, shipping_rates(*)')
      .single()
    setBusy(false)
    if (error || !data) {
      toast.error('เพิ่มโซนไม่สำเร็จ')
      return
    }
    setZones([...zones, data as ShippingZoneWithRates])
    setNewZone('')
  }

  async function removeZone(zone: ShippingZoneWithRates) {
    if (!confirm(`ลบโซน "${zone.name}" และค่าส่งทั้งหมดในโซนนี้?`)) return
    const { error } = await supabase.from('shipping_zones').delete().eq('id', zone.id)
    if (error) {
      toast.error('ลบไม่สำเร็จ')
      return
    }
    setZones(zones.filter((z) => z.id !== zone.id))
  }

  async function updateZone(zone: ShippingZoneWithRates, patch: Partial<ShippingZoneWithRates>) {
    const { data, error } = await supabase
      .from('shipping_zones')
      .update(patch)
      .eq('id', zone.id)
      .select('*, shipping_rates(*)')
      .single()
    if (error || !data) {
      toast.error('บันทึกไม่สำเร็จ')
      return
    }
    replaceZone(data as ShippingZoneWithRates)
    router.refresh()
  }

  async function setDefaultZone(zone: ShippingZoneWithRates) {
    // โซนสำรองมีได้อันเดียว
    await supabase.from('shipping_zones').update({ is_default: false }).neq('id', zone.id)
    await updateZone(zone, { is_default: true })
    setZones((prev) => prev.map((z) => (z.id === zone.id ? { ...z, is_default: true } : { ...z, is_default: false })))
  }

  async function addRate(zone: ShippingZoneWithRates, weightKg: string, price: string) {
    const grams = Math.round(parseFloat(weightKg) * 1000)
    const value = parseFloat(price)
    if (!grams || grams <= 0 || isNaN(value)) {
      toast.error('กรอกน้ำหนักและราคาให้ถูกต้อง')
      return
    }
    const { data, error } = await supabase
      .from('shipping_rates')
      .insert({ zone_id: zone.id, max_weight_grams: grams, price: value })
      .select('*')
      .single()
    if (error || !data) {
      toast.error(error?.code === '23505' ? 'มีช่วงน้ำหนักนี้อยู่แล้ว' : 'เพิ่มไม่สำเร็จ')
      return
    }
    replaceZone({ ...zone, shipping_rates: [...(zone.shipping_rates ?? []), data] })
  }

  async function removeRate(zone: ShippingZoneWithRates, rateId: string) {
    const { error } = await supabase.from('shipping_rates').delete().eq('id', rateId)
    if (error) {
      toast.error('ลบไม่สำเร็จ')
      return
    }
    replaceZone({ ...zone, shipping_rates: (zone.shipping_rates ?? []).filter((r) => r.id !== rateId) })
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Truck size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">ค่าจัดส่ง</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        ค่าส่งคิดจาก <b>น้ำหนักรวมของตะกร้า</b> ตามโซนของจังหวัดปลายทาง — ระบบเลือกช่วงน้ำหนักแรกที่รองรับ
        ถ้าหนักเกินช่วงสูงสุด ลูกค้าจะสั่งแบบจัดส่งไม่ได้ (ให้มารับที่ร้านหรือติดต่อร้าน)
      </p>

      <div className="space-y-4">
        {zones.map((zone) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            onRename={(name) => updateZone(zone, { name })}
            onSetDefault={() => setDefaultZone(zone)}
            onDelete={() => removeZone(zone)}
            onAddProvince={(province) => updateZone(zone, { provinces: [...(zone.provinces ?? []), province] })}
            onRemoveProvince={(province) =>
              updateZone(zone, { provinces: (zone.provinces ?? []).filter((p) => p !== province) })
            }
            onAddRate={(w, p) => addRate(zone, w, p)}
            onRemoveRate={(id) => removeRate(zone, id)}
          />
        ))}

        <div className="flex gap-2">
          <input
            className={inputClass}
            value={newZone}
            onChange={(e) => setNewZone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addZone() } }}
            placeholder="ชื่อโซนใหม่ เช่น ภาคใต้"
          />
          <button
            type="button"
            onClick={addZone}
            disabled={busy}
            className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            เพิ่มโซน
          </button>
        </div>
      </div>
    </section>
  )
}

function ZoneCard({
  zone,
  onRename,
  onSetDefault,
  onDelete,
  onAddProvince,
  onRemoveProvince,
  onAddRate,
  onRemoveRate,
}: {
  zone: ShippingZoneWithRates
  onRename: (name: string) => void
  onSetDefault: () => void
  onDelete: () => void
  onAddProvince: (province: string) => void
  onRemoveProvince: (province: string) => void
  onAddRate: (weightKg: string, price: string) => void
  onRemoveRate: (id: string) => void
}) {
  const [name, setName] = useState(zone.name)
  const [weight, setWeight] = useState('')
  const [price, setPrice] = useState('')

  const rates = [...(zone.shipping_rates ?? [])].sort((a, b) => a.max_weight_grams - b.max_weight_grams)
  const available = PROVINCES.filter((p) => !(zone.provinces ?? []).includes(p))

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== zone.name && onRename(name.trim())}
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
          <input
            type="radio"
            name="default-zone"
            checked={zone.is_default}
            onChange={onSetDefault}
            className="w-3.5 h-3.5 accent-blue-600"
          />
          จังหวัดที่เหลือ
        </label>
        <button type="button" onClick={onDelete} className="p-2 text-gray-400 hover:text-red-600">
          <Trash2 size={15} />
        </button>
      </div>

      {/* จังหวัดในโซน */}
      {!zone.is_default && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {(zone.provinces ?? []).map((province) => (
              <span key={province} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-700">
                {province}
                <button type="button" onClick={() => onRemoveProvince(province)} className="text-gray-400 hover:text-red-600">
                  <X size={11} />
                </button>
              </span>
            ))}
            {(zone.provinces ?? []).length === 0 && (
              <span className="text-xs text-gray-400">ยังไม่ได้เลือกจังหวัด</span>
            )}
          </div>
          <select
            className="mt-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value=""
            onChange={(e) => e.target.value && onAddProvince(e.target.value)}
          >
            <option value="">+ เพิ่มจังหวัดในโซนนี้</option>
            {available.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}
      {zone.is_default && (
        <p className="mt-2 text-xs text-gray-500">โซนนี้ใช้กับทุกจังหวัดที่ไม่ได้อยู่ในโซนอื่น</p>
      )}

      {/* ตารางค่าส่งตามน้ำหนัก */}
      <div className="mt-3">
        <p className="text-xs font-medium text-gray-600 mb-1.5">ค่าส่งตามน้ำหนัก</p>
        {rates.length === 0 ? (
          <p className="text-xs text-amber-600">ยังไม่ได้ตั้งค่าส่ง — จังหวัดในโซนนี้จะสั่งแบบจัดส่งไม่ได้</p>
        ) : (
          <div className="space-y-1">
            {rates.map((rate) => (
              <div key={rate.id} className="flex items-center gap-3 text-sm">
                <span className="text-gray-600">ไม่เกิน {formatWeight(rate.max_weight_grams)}</span>
                <span className="font-medium text-gray-900">฿{Number(rate.price).toLocaleString('th-TH')}</span>
                <button type="button" onClick={() => onRemoveRate(rate.id)} className="p-1 text-gray-300 hover:text-red-600">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <input
            type="number" min="0" step="0.1" value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="กก."
          />
          <input
            type="number" min="0" step="1" value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="บาท"
          />
          <button
            type="button"
            onClick={() => { onAddRate(weight, price); setWeight(''); setPrice('') }}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-blue-600 font-medium"
          >
            <Plus size={14} /> เพิ่มช่วง
          </button>
        </div>
      </div>
    </div>
  )
}
