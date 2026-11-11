import type { CartItem, PointsConfig } from '@/lib/types'

/** สินค้าที่พอจะตัดสินได้ว่าสะสมแต้มไหม — รับได้ทั้งก้อนเต็มและแถวที่ select มาบางคอลัมน์ */
interface PointsProduct {
  is_service?: boolean | null
  earns_points?: boolean | null
  categories?: { earns_points?: boolean | null } | null
}

/**
 * สินค้าตัวนี้สะสมแต้มไหม — ค่ารายสินค้าชนะหมวด เหมือน vat_applicable / clinic_only
 *
 * ค่าตรวจ/ค่าหัตถการ/ค่าบริการ (is_service) ไม่สะสมแต้มเสมอ ไม่ต้องไปตั้งธงรายตัว
 * ส่วนยาเป็น "ของ" ที่มีสต็อกจริง จึงต้องใช้ธง earns_points — ดู supabase-migration-points-goods-only.sql
 */
export function earnsPoints(product: PointsProduct): boolean {
  if (product.is_service) return false
  if (product.earns_points !== null && product.earns_points !== undefined) {
    return product.earns_points
  }
  return product.categories?.earns_points ?? true
}

/**
 * แต้มสะสมคิดจาก "ค่าของ" เท่านั้น ไม่รวมค่ารักษา/ค่าบริการ/ค่ายา
 *
 * ค่าตรวจ ค่าหัตถการ ค่าผ่าตัด ไม่ใช่การซื้อของ จึงไม่สะสมแต้ม และยา (ทั้งยาคลินิก
 * กับยากันเห็บหมัดที่ขายหน้าร้าน) ก็ไม่สะสม เพราะราคาสูงแต่กำไรบาง
 * — แต่ลูกค้า "ใช้" แต้มมาหักค่ารักษา/ค่ายาได้ตามปกติ กฎนี้คุมแค่ขาได้แต้ม
 *
 * บิลหนึ่งใบมักมีทั้งสองอย่าง (ค่าตรวจ + ยา + อาหารกลับบ้าน) จึงต้องเกลี่ยตามสัดส่วน:
 * ยอดที่จ่ายจริงหลังหักส่วนลด/แต้ม/เครดิต/ปัดเศษแล้ว คูณด้วยสัดส่วนค่าของในบิล
 * ทำแบบนี้ส่วนลดท้ายบิลจะถูกเฉลี่ยลงทั้งสองฝั่งเท่า ๆ กัน ไม่ใช่ไปกินฝั่งใดฝั่งเดียว
 */
export function pointsEligibleAmount(cart: CartItem[], paidAmount: number): number {
  if (paidAmount <= 0) return 0
  const all = cart.reduce((s, i) => s + i.subtotal, 0)
  // ตะกร้าที่ราคารวมเป็น 0 (ของแลกแต้มทั้งใบ) ไม่มีฐานให้เกลี่ย
  if (all <= 0) return 0
  const goods = cart.reduce((s, i) => s + (earnsPoints(i.product) ? i.subtotal : 0), 0)
  if (goods <= 0) return 0
  // ทั้งบิลเป็นของที่สะสมแต้มอยู่แล้ว — ใช้ยอดที่จ่ายจริงตรง ๆ (กันเพี้ยนจากการหารทศนิยม)
  if (goods >= all) return paidAmount
  return paidAmount * (goods / all)
}

/** ยอดในบิลที่ไม่สะสมแต้ม (ค่ารักษา/ค่าบริการ/ยา) — ไว้บอกแคชเชียร์เวลาลูกค้าถามว่าทำไมแต้มน้อย */
export function noPointsSubtotal(cart: CartItem[]): number {
  return cart.reduce((s, i) => s + (earnsPoints(i.product) ? 0 : i.subtotal), 0)
}

/** แต้มที่ลูกค้าจะได้จากบิลนี้ · config เป็น null = ปิดระบบแต้ม */
export function earnedPointsFor(
  cart: CartItem[],
  paidAmount: number,
  config: PointsConfig | null,
): number {
  if (!config) return 0
  const eligible = pointsEligibleAmount(cart, paidAmount)
  if (eligible <= 0) return 0
  return Math.floor(eligible / config.spend_amount) * config.earn_points
}
