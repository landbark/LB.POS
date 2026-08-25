import type { OrderStatus, ShippingZoneWithRates } from '@/lib/types'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'รอชำระเงิน',
  awaiting_confirm: 'รอร้านตรวจสอบ',
  confirmed: 'ยืนยันแล้ว — กำลังจัดของ',
  shipped: 'จัดส่งแล้ว',
  ready_pickup: 'พร้อมให้มารับ',
  completed: 'รับของแล้ว',
  cancelled: 'ยกเลิก',
}

/** สีป้ายสถานะ (ใช้ทั้งหน้าแอดมินและหน้าลูกค้า) */
export const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  pending_payment: 'bg-amber-100 text-amber-800',
  awaiting_confirm: 'bg-orange-100 text-orange-800',
  confirmed: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  ready_pickup: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-200 text-gray-600',
}

/** สถานะที่ยังไม่ตัดสต็อค — ยกเลิกได้โดยไม่ต้องคืนของ */
export const ORDER_STATUSES_BEFORE_STOCK: OrderStatus[] = ['pending_payment', 'awaiting_confirm']

/** น้ำหนักแบบคร่าวๆ สำหรับหน้าลูกค้า — ทศนิยม 1 ตำแหน่งพอ ไม่ต้องเป๊ะ */
export const formatWeightApprox = (grams: number) =>
  grams >= 1000 ? `${(Math.round(grams / 100) / 10).toFixed(1)} กก.` : `${grams} ก.`

export const formatWeight = (grams: number) =>
  grams >= 1000
    ? `${(grams / 1000).toFixed(2).replace(/\.?0+$/, '')} กก.`
    : `${grams} ก.`

export function zoneForProvince(zones: ShippingZoneWithRates[], province: string) {
  const trimmed = province.trim()
  if (!trimmed) return null
  return (
    zones.find((z) => z.provinces?.some((p) => p.trim() === trimmed)) ??
    zones.find((z) => z.is_default) ??
    null
  )
}

export type ShippingQuote =
  | { ok: true; fee: number; zoneName: string; free: boolean }
  | { ok: false; reason: string }

/**
 * ค่าส่ง = ช่วงน้ำหนักแรกของโซนที่รองรับน้ำหนักรวมของตะกร้า
 * ไม่มีโซน/ไม่มีช่วงที่รองรับ = คิดอัตโนมัติไม่ได้ (ให้ลูกค้ามารับที่ร้านหรือติดต่อร้าน)
 */
export function quoteShipping(params: {
  zones: ShippingZoneWithRates[]
  province: string
  weightGrams: number
  subtotal: number
  freeShippingMin?: number | null
}): ShippingQuote {
  const { zones, province, weightGrams, subtotal, freeShippingMin } = params

  if (!province.trim()) return { ok: false, reason: 'เลือกจังหวัดปลายทางเพื่อคิดค่าส่ง' }

  const zone = zoneForProvince(zones, province)
  if (!zone) return { ok: false, reason: 'ยังไม่ได้ตั้งค่าโซนจัดส่งสำหรับจังหวัดนี้' }

  const rates = [...(zone.shipping_rates ?? [])].sort((a, b) => a.max_weight_grams - b.max_weight_grams)
  if (rates.length === 0) return { ok: false, reason: `ยังไม่ได้ตั้งค่าส่งของโซน "${zone.name}"` }

  const rate = rates.find((r) => weightGrams <= r.max_weight_grams)
  if (!rate) {
    return {
      ok: false,
      reason: `น้ำหนักรวม ${formatWeight(weightGrams)} เกินช่วงที่ส่งได้ (สูงสุด ${formatWeight(
        rates[rates.length - 1].max_weight_grams
      )}) — เลือกรับที่ร้านหรือติดต่อร้านเพื่อแยกพัสดุ`,
    }
  }

  if (freeShippingMin != null && freeShippingMin > 0 && subtotal >= freeShippingMin) {
    return { ok: true, fee: 0, zoneName: zone.name, free: true }
  }

  return { ok: true, fee: Number(rate.price), zoneName: zone.name, free: false }
}

/** ที่อยู่บรรทัดเดียวสำหรับพิมพ์/แสดงผล */
export function formatAddress(a: {
  address_line?: string | null
  subdistrict?: string | null
  district?: string | null
  province?: string | null
  postal_code?: string | null
}) {
  return [a.address_line, a.subdistrict, a.district, a.province, a.postal_code]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')
}
