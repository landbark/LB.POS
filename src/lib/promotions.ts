import type { ChannelScope, Promotion } from './types'

/**
 * ทุกอย่างในไฟล์นี้คิดเป็น "หน่วยฐาน" เสมอ — ซื้อ 1 กล่อง (12 ซอง) นับเป็น 12 ชิ้น
 * ไม่งั้นเงื่อนไข "ซื้อครบ 10 ชิ้น" จะไม่เข้าเวลาลูกค้าหยิบยกกล่อง
 */

/** สินค้าชิ้นนี้อยู่ในขอบเขตของโปรนี้ไหม */
export function promotionCovers(
  promo: Promotion,
  product: { id: string; category_id?: string | null },
): boolean {
  if (promo.apply_to === 'all') return true
  if (promo.apply_to === 'products') return promo.product_ids.includes(product.id)
  return Boolean(product.category_id) && promo.category_ids.includes(product.category_id!)
}

export const CHANNEL_SCOPE_LABEL: Record<ChannelScope, string> = {
  all: 'ทุกที่',
  store: 'หน้าร้าน',
  booth: 'งานออกบูธ',
}

/**
 * โปรนี้ใช้ได้ในโหมดที่กำลังขายอยู่ไหม
 *
 * ราคาที่งานกับที่ร้านคนละราคาอยู่แล้ว (booth_price) โปรก็ต้องแยกได้ด้วย —
 * โปรบูธไม่ควรเด้งตอนลูกค้าซื้อที่ร้าน และโปรหน้าร้านก็ไม่ควรไปลดซ้ำกับราคาบูธที่ลดมาแล้ว
 */
export const promotionInChannel = (promo: Promotion, boothMode: boolean) =>
  promo.channel_scope === 'all' || promo.channel_scope === (boothMode ? 'booth' : 'store')

/** หมดอายุแล้วไหม — end_date ว่าง = ไม่มีวันหมด ใช้ไปเรื่อยๆ จนกดปิดใช้งาน */
export const promotionExpired = (promo: Promotion, today: string) =>
  promo.end_date != null && promo.end_date < today

/** เงื่อนไข "ซื้อครบ" ผ่านไหม — ว่างทั้งคู่ = ไม่มีเงื่อนไข ลดทันที */
export function promotionConditionMet(promo: Promotion, baseQuantity: number, gross: number): boolean {
  if (promo.min_quantity && baseQuantity < promo.min_quantity) return false
  if (promo.min_amount && gross < promo.min_amount) return false
  return true
}

/**
 * ส่วนลดของโปรหนึ่งอันกับรายการหนึ่งบรรทัด (บาท)
 * @param baseQuantity จำนวนในหน่วยฐาน
 * @param gross        ยอดของบรรทัดก่อนลด
 * @param basePrice    ราคาต่อหน่วยฐาน (ใช้ตีมูลค่าของแถม)
 */
export function promotionDiscount(
  promo: Promotion,
  baseQuantity: number,
  gross: number,
  basePrice: number,
): number {
  if (!promotionConditionMet(promo, baseQuantity, gross)) return 0

  let discount = 0

  if (promo.type === 'percent_discount' && promo.discount_percent) {
    // คิดจากยอดจริงของบรรทัด ไม่ใช่ราคาฐาน × จำนวน — บรรทัดที่ขายยกกล่องมีราคาของตัวเอง
    discount = (gross * promo.discount_percent) / 100
  } else if (promo.type === 'amount_discount' && promo.discount_amount) {
    discount = promo.amount_mode === 'per_unit'
      ? promo.discount_amount * baseQuantity
      : promo.discount_amount
  } else if (promo.type === 'buy_x_get_y' && promo.buy_quantity && promo.get_quantity) {
    const sets = Math.floor(baseQuantity / promo.buy_quantity)
    const freeQty = Math.min(sets * promo.get_quantity, baseQuantity - sets * promo.buy_quantity)
    discount = freeQty * basePrice
  }

  if (promo.max_discount) discount = Math.min(discount, promo.max_discount)
  return Math.min(discount, gross)
}

/**
 * โปรที่เข้าเงื่อนไขพร้อมกันหลายอัน = เลือกอันที่ลูกค้าได้ลดเยอะสุด (ไม่ซ้อนกัน)
 * ซ้อนกันจะเดายอดไม่ได้เลย และโปรทุกอันที่คลุม "ทุกสินค้า" จะไปบวกกับโปรเฉพาะตัวหมด
 */
export function bestPromotion(
  promotions: Promotion[],
  product: { id: string; category_id?: string | null; price: number },
  baseQuantity: number,
  gross: number,
): { promo: Promotion; discount: number } | null {
  let best: { promo: Promotion; discount: number } | null = null

  for (const promo of promotions) {
    if (!promotionCovers(promo, product)) continue
    const discount = promotionDiscount(promo, baseQuantity, gross, product.price)
    if (discount > 0 && (!best || discount > best.discount)) best = { promo, discount }
  }

  return best
}

const money = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })

/** ส่วนลด — ประโยคสั้นๆ เช่น "ลด 10%" / "ลด 20 บาท/ชิ้น" */
export function describeDiscount(p: Promotion): string {
  if (p.type === 'percent_discount') {
    const cap = p.max_discount ? ` (ลดสูงสุด ${money(p.max_discount)} บาท)` : ''
    return `ลด ${p.discount_percent}%${cap}`
  }
  if (p.type === 'amount_discount') {
    const per = p.amount_mode === 'per_unit' ? '/ชิ้น' : '/รายการ'
    return `ลด ${money(p.discount_amount ?? 0)} บาท${per}`
  }
  return `ซื้อ ${p.buy_quantity} แถม ${p.get_quantity}`
}

/** เงื่อนไข — คืนค่าว่างถ้าไม่มีเงื่อนไข */
export function describeCondition(p: Promotion): string {
  const parts: string[] = []
  if (p.min_quantity) parts.push(`ซื้อครบ ${p.min_quantity} ชิ้น`)
  if (p.min_amount) parts.push(`ยอดครบ ${money(p.min_amount)} บาท`)
  return parts.join(' และ ')
}

/** บรรทัดเดียวจบ — เงื่อนไข + ส่วนลด ใช้ขึ้นป้ายและในตาราง */
export function describePromotion(p: Promotion): string {
  const cond = describeCondition(p)
  return cond ? `${cond} ${describeDiscount(p)}` : describeDiscount(p)
}

type PromotionRow = Omit<Promotion, 'product_ids' | 'category_ids' | 'channel_scope'> & {
  /** ไม่มีค่าถ้า migration ยังไม่ลง — PROMOTION_SELECT เป็น '*' จึงไม่ error แค่ขาดคอลัมน์ไป */
  channel_scope?: ChannelScope | null
  promotion_products?: { product_id: string }[] | null
  promotion_categories?: { category_id: string }[] | null
}

/** แปลงแถวที่ join ตารางเชื่อมมาแล้วให้เป็น Promotion ที่หน้าจอใช้ได้ */
export function toPromotion(row: PromotionRow): Promotion {
  const { promotion_products, promotion_categories, ...promo } = row
  return {
    ...promo,
    // deploy โค้ดก่อนรัน migration = ไม่มี channel_scope มา ถือเป็น "ทุกที่" ตามพฤติกรรมเดิม
    // (ถ้าปล่อยเป็น undefined หน้าขายจะกรองโปรออกหมด = ทั้งร้านไม่ลดอะไรเลยโดยไม่มีใครรู้)
    channel_scope: promo.channel_scope ?? 'all',
    product_ids: (promotion_products ?? []).map((r) => r.product_id),
    category_ids: (promotion_categories ?? []).map((r) => r.category_id),
  }
}

/** select ที่ต้องใช้ทุกครั้งที่ดึงโปรโมชั่น — ขอบเขตอยู่ในตารางเชื่อม */
export const PROMOTION_SELECT = '*, promotion_products(product_id), promotion_categories(category_id)'
