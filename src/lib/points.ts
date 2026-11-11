import type { CartItem, PointsConfig } from '@/lib/types'

/**
 * แต้มสะสมคิดจาก "ค่าของ" เท่านั้น ไม่รวมค่ารักษา/ค่าบริการ
 *
 * ค่าตรวจ ค่าหัตถการ ค่าผ่าตัด (สินค้าที่ตั้งธง is_service) ไม่ใช่การซื้อของ จึงไม่สะสมแต้ม
 * — แต่ลูกค้า "ใช้" แต้มมาหักค่ารักษาได้ตามปกติ กฎนี้คุมแค่ขาได้แต้ม ไม่ได้คุมขาใช้แต้ม
 *
 * บิลคลินิกมักมีทั้งสองอย่างในใบเดียว (ค่าตรวจ + ยากลับบ้าน) จึงต้องเกลี่ยตามสัดส่วน:
 * ยอดที่จ่ายจริงหลังหักส่วนลด/แต้ม/เครดิต/ปัดเศษแล้ว คูณด้วยสัดส่วนค่าของในบิล
 * ทำแบบนี้ส่วนลดท้ายบิลจะถูกเฉลี่ยลงทั้งสองฝั่งเท่า ๆ กัน ไม่ใช่ไปกินฝั่งใดฝั่งเดียว
 */
export function pointsEligibleAmount(cart: CartItem[], paidAmount: number): number {
  if (paidAmount <= 0) return 0
  const all = cart.reduce((s, i) => s + i.subtotal, 0)
  // ตะกร้าที่ราคารวมเป็น 0 (ของแลกแต้มทั้งใบ) ไม่มีฐานให้เกลี่ย
  if (all <= 0) return 0
  const goods = cart.reduce((s, i) => s + (i.product.is_service ? 0 : i.subtotal), 0)
  if (goods <= 0) return 0
  // ไม่มีค่าบริการในบิลเลย — ใช้ยอดที่จ่ายจริงตรง ๆ ไม่ต้องเกลี่ย (กันเพี้ยนจากการหารทศนิยม)
  if (goods >= all) return paidAmount
  return paidAmount * (goods / all)
}

/** ค่าบริการในตะกร้า (ราคาในบิล) — ไว้บอกแคชเชียร์ว่าส่วนนี้ไม่สะสมแต้ม */
export function serviceSubtotal(cart: CartItem[]): number {
  return cart.reduce((s, i) => s + (i.product.is_service ? i.subtotal : 0), 0)
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
