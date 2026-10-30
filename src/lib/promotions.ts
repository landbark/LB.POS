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

/**
 * เงื่อนไข "ซื้อครบ" ผ่านไหม — ว่างทั้งคู่ = ไม่มีเงื่อนไข ลดทันที
 * ตัวเลขที่ส่งเข้ามาเป็นของบรรทัดเดียว หรือของทุกบรรทัดรวมกัน (โปรคละสินค้า) แล้วแต่ผู้เรียก
 */
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
export interface PromoPick {
  promo: Promotion
  discount: number
}

export function bestPromotion(
  promotions: Promotion[],
  product: { id: string; category_id?: string | null; price: number },
  baseQuantity: number,
  gross: number,
): PromoPick | null {
  let best: PromoPick | null = null

  for (const promo of promotions) {
    if (!promotionCovers(promo, product)) continue
    const discount = promotionDiscount(promo, baseQuantity, gross, product.price)
    if (discount > 0 && (!best || discount > best.discount)) best = { promo, discount }
  }

  return best
}

/** หนึ่งบรรทัดในบิลที่ส่งเข้ามาให้คิดส่วนลด — จำนวนเป็นหน่วยฐาน, gross = ยอดก่อนลด */
export interface PromoLine {
  product: { id: string; category_id?: string | null; price: number }
  baseQuantity: number
  gross: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * ยอดส่วนลดก้อนเดียวของโปรคละสินค้า แยกลงแต่ละบรรทัดตามน้ำหนัก
 * เศษสตางค์ไปกองที่บรรทัดสุดท้าย ผลรวมจึงตรงกับก้อนที่คิดไว้เป๊ะ
 */
function allocate(total: number, weights: [number, number][]): Map<number, number> {
  const out = new Map<number, number>()
  const sum = weights.reduce((s, [, w]) => s + w, 0)
  if (total <= 0 || sum <= 0) return out

  let left = round2(total)
  weights.forEach(([index, weight], i) => {
    // บรรทัดสุดท้ายรับเศษที่เหลือ แต่ไม่เกินน้ำหนักของตัวเอง (= ยอดของบรรทัดนั้น) จะได้ไม่ลดเกินราคา
    const share = Math.min(left, weight, i === weights.length - 1 ? left : round2((total * weight) / sum))
    if (share > 0) out.set(index, round2(share))
    left = round2(left - share)
  })
  return out
}

/**
 * โปร "คละสินค้า" — นับชิ้นและยอดของทุกบรรทัดที่โปรคลุมรวมกัน
 * แล้วเฉลี่ยส่วนลดกลับลงแต่ละบรรทัด (บิลยังเก็บส่วนลดรายบรรทัดเหมือนเดิม)
 *
 * คืน Map ว่าบรรทัดไหนได้ส่วนลดเท่าไหร่ — ว่าง = โปรนี้ยังไม่เข้าเงื่อนไข
 */
function combinedDiscounts(promo: Promotion, lines: PromoLine[]): Map<number, number> {
  const covered = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => promotionCovers(promo, line.product) && line.gross > 0 && line.baseQuantity > 0)
  if (covered.length === 0) return new Map()

  const totalQuantity = covered.reduce((s, { line }) => s + line.baseQuantity, 0)
  const totalGross = covered.reduce((s, { line }) => s + line.gross, 0)
  if (!promotionConditionMet(promo, totalQuantity, totalGross)) return new Map()

  // น้ำหนักที่ใช้เฉลี่ยส่วนลด — ปกติตามยอดของบรรทัด
  let weights: [number, number][] = covered.map(({ line, index }) => [index, line.gross])
  let discount = 0

  if (promo.type === 'percent_discount' && promo.discount_percent) {
    discount = (totalGross * promo.discount_percent) / 100
  } else if (promo.type === 'amount_discount' && promo.discount_amount) {
    // ต่อชิ้น = คูณจำนวนรวมทั้งกลุ่ม, ต่อรายการ = ลดครั้งเดียวทั้งกลุ่ม (ไม่ใช่ทุกบรรทัด)
    discount = promo.amount_mode === 'per_unit'
      ? promo.discount_amount * totalQuantity
      : promo.discount_amount
  } else if (promo.type === 'buy_x_get_y' && promo.buy_quantity && promo.get_quantity) {
    const sets = Math.floor(totalQuantity / promo.buy_quantity)
    let free = Math.min(sets * promo.get_quantity, totalQuantity - sets * promo.buy_quantity)
    // คละได้ = แถมของที่ถูกที่สุดในกลุ่ม ตามที่ร้านพูดกับลูกค้า (ไม่งั้นลูกค้าเลือกแถมตัวแพงสุดเสมอ)
    const cheapestFirst = [...covered].sort(
      (a, b) => a.line.gross / a.line.baseQuantity - b.line.gross / b.line.baseQuantity,
    )
    const freeWeights: [number, number][] = []
    for (const { line, index } of cheapestFirst) {
      if (free <= 0) break
      const take = Math.min(free, line.baseQuantity)
      const unitPrice = line.gross / line.baseQuantity
      freeWeights.push([index, take * unitPrice])
      discount += take * unitPrice
      free -= take
    }
    weights = freeWeights
  }

  if (promo.max_discount) discount = Math.min(discount, promo.max_discount)
  return allocate(Math.min(discount, totalGross), weights)
}

/**
 * คิดโปรให้ทุกบรรทัดในตะกร้าพร้อมกัน — คืนโปรที่ลดเยอะสุดของแต่ละบรรทัด (index ตรงกับ lines)
 *
 * ต้องคิดทั้งตะกร้าทีเดียว ไม่ใช่ทีละบรรทัด เพราะโปรคละสินค้าเปลี่ยนส่วนลดของบรรทัดอื่นด้วย —
 * หยิบชิ้นที่สองลงตะกร้าแล้วบรรทัดแรกต้องลดตามทันที
 *
 * ยังเลือกโปรเดียวต่อบรรทัด (อันที่ลดเยอะสุด) ไม่ลดซ้อน เหมือนกฎเดิม
 */
export function applyPromotions(promotions: Promotion[], lines: PromoLine[]): (PromoPick | null)[] {
  const best: (PromoPick | null)[] = lines.map(() => null)

  const keep = (index: number, pick: PromoPick) => {
    if (pick.discount > 0 && (!best[index] || pick.discount > best[index]!.discount)) best[index] = pick
  }

  for (const promo of promotions) {
    if (promo.combine_items) {
      for (const [index, discount] of combinedDiscounts(promo, lines)) keep(index, { promo, discount })
      continue
    }
    lines.forEach((line, index) => {
      if (!promotionCovers(promo, line.product)) return
      keep(index, {
        promo,
        discount: promotionDiscount(promo, line.baseQuantity, line.gross, line.product.price),
      })
    })
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
    // คละสินค้า + ต่อรายการ = ลดครั้งเดียวทั้งกลุ่มที่โปรคลุม ไม่ใช่ลดทุกบรรทัด
    const per = p.amount_mode === 'per_unit' ? '/ชิ้น' : p.combine_items ? '/บิล' : '/รายการ'
    return `ลด ${money(p.discount_amount ?? 0)} บาท${per}`
  }
  const mix = p.combine_items ? ' (คละสินค้าได้)' : ''
  return `ซื้อ ${p.buy_quantity} แถม ${p.get_quantity}${mix}`
}

/** เงื่อนไข — คืนค่าว่างถ้าไม่มีเงื่อนไข */
export function describeCondition(p: Promotion): string {
  const parts: string[] = []
  if (p.min_quantity) parts.push(`ซื้อครบ ${p.min_quantity} ชิ้น`)
  if (p.min_amount) parts.push(`ยอดครบ ${money(p.min_amount)} บาท`)
  if (parts.length === 0) return ''
  // ลูกค้าถามทุกครั้งว่า "คนละตัวได้ไหม" — เขียนติดไปกับเงื่อนไขเลย
  return `${parts.join(' และ ')}${p.combine_items ? ' (คละสินค้าได้)' : ''}`
}

/** บรรทัดเดียวจบ — เงื่อนไข + ส่วนลด ใช้ขึ้นป้ายและในตาราง */
export function describePromotion(p: Promotion): string {
  const cond = describeCondition(p)
  return cond ? `${cond} ${describeDiscount(p)}` : describeDiscount(p)
}

type PromotionRow = Omit<Promotion, 'product_ids' | 'category_ids' | 'channel_scope' | 'combine_items'> & {
  /** ไม่มีค่าถ้า migration ยังไม่ลง — PROMOTION_SELECT เป็น '*' จึงไม่ error แค่ขาดคอลัมน์ไป */
  channel_scope?: ChannelScope | null
  combine_items?: boolean | null
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
    // ยังไม่มีคอลัมน์ = นับแยกทีละบรรทัดเหมือนพฤติกรรมเดิม
    combine_items: promo.combine_items ?? false,
    product_ids: (promotion_products ?? []).map((r) => r.product_id),
    category_ids: (promotion_categories ?? []).map((r) => r.category_id),
  }
}

/** select ที่ต้องใช้ทุกครั้งที่ดึงโปรโมชั่น — ขอบเขตอยู่ในตารางเชื่อม */
export const PROMOTION_SELECT = '*, promotion_products(product_id), promotion_categories(category_id)'
