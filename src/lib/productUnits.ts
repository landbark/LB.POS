import type { CartItem, Product, ProductUnit } from '@/lib/types'

/**
 * หน่วยขายของสินค้า — สต็อคอยู่ที่หน่วยฐานกองเดียว (products.unit) ส่วนกล่อง/ลัง
 * เป็นแค่ "หยิบทีละเท่าไหร่" ที่มีราคาของตัวเอง
 *
 * ทุกที่ที่คิดสต็อคต้องผ่าน baseQty() — ห้ามใช้ quantity ตรงๆ
 * ไม่งั้นขาย 1 กล่องจะตัดสต็อคไปซองเดียว
 */

/** ตัวเลือกหน่วยในรูปแบบเดียวกันทั้งหน่วยฐานและแพ็ก — หน่วยฐานคือ unit = null */
export interface UnitChoice {
  unit: ProductUnit | null
  name: string
  factor: number
  price: number
  cost: number | null
}

/** จำนวนหน่วยฐานของแพ็กหนึ่งแพ็ก (หน่วยฐาน = 1) */
export const factorOf = (unit: ProductUnit | null | undefined) => unit?.factor ?? 1

/** ชื่อหน่วยที่เอาไปโชว์/พิมพ์บนใบเสร็จ */
export const unitNameOf = (product: Product, unit: ProductUnit | null | undefined) =>
  unit?.unit_name ?? product.unit

/** ราคาต่อแพ็ก — ไม่ได้ตั้งราคาแพ็กไว้ = factor × ราคาฐาน (เท่ากับไม่ลดราคา) */
export const unitPriceOf = (product: Product, unit: ProductUnit | null | undefined) =>
  unit ? (unit.price ?? product.price * unit.factor) : product.price

/** ราคาขายตอนออกบูธคิดจากราคาบูธของหน่วยฐาน (แพ็กที่ตั้งราคาเองไว้ใช้ราคานั้นตามเดิม) */
export const boothUnitPriceOf = (product: Product, unit: ProductUnit | null | undefined) =>
  unit ? (unit.price ?? (product.booth_price ?? product.price) * unit.factor) : (product.booth_price ?? product.price)

/** ทุนต่อแพ็ก — ไม่ได้ตั้ง = factor × ทุนฐาน */
export const unitCostOf = (product: Product, unit: ProductUnit | null | undefined) => {
  if (!unit) return product.cost
  if (unit.cost != null) return unit.cost
  return product.cost == null ? null : product.cost * unit.factor
}

/** จำนวนหน่วยฐานที่ต้องตัดสต็อคของบรรทัดในตะกร้า */
export const baseQty = (item: Pick<CartItem, 'unit' | 'quantity'>) =>
  item.quantity * factorOf(item.unit)

const sortUnits = (units: ProductUnit[]) =>
  [...units].sort((a, b) => a.sort_order - b.sort_order || a.factor - b.factor)

/** หน่วยที่ยังใช้งานอยู่ทั้งหมดของสินค้า (เรียงเล็ก→ใหญ่) */
export const unitsOf = (product: Product) => sortUnits((product.product_units ?? []).filter((u) => u.active))

/** ตัวเลือกหน่วยในหน้าขาย — หน่วยฐานมาก่อน แล้วค่อยแพ็กที่เปิดขายหน้าร้าน */
export function posUnitChoices(product: Product): UnitChoice[] {
  const base: UnitChoice = {
    unit: null,
    name: product.unit,
    factor: 1,
    price: product.price,
    cost: product.cost,
  }
  const packs = unitsOf(product)
    .filter((u) => u.sellable_pos)
    .map((u) => ({
      unit: u,
      name: u.unit_name,
      factor: u.factor,
      price: unitPriceOf(product, u),
      cost: unitCostOf(product, u),
    }))
  return [base, ...packs]
}

/** ตัวเลือกหน่วยตอนทำใบสั่งซื้อ/รับเข้า — ลังอยู่ตรงนี้แม้จะปิดขายหน้าร้าน */
export function purchaseUnitChoices(product: {
  unit: string
  cost: number | null
  product_units?: ProductUnit[] | null
}): UnitChoice[] {
  const base: UnitChoice = { unit: null, name: product.unit, factor: 1, price: 0, cost: product.cost }
  const packs = sortUnits((product.product_units ?? []).filter((u) => u.active && u.purchasable)).map((u) => ({
    unit: u,
    name: u.unit_name,
    factor: u.factor,
    price: 0,
    cost: u.cost != null ? u.cost : product.cost == null ? null : product.cost * u.factor,
  }))
  return [base, ...packs]
}

/** หน่วยที่เปิดขายบนเว็บ */
export const onlineUnitsOf = (product: Product) => unitsOf(product).filter((u) => u.sellable_online)

/**
 * หาสินค้า+หน่วยจากบาร์โค้ดที่ยิงเข้ามา — บาร์โค้ดข้างกล่องคนละตัวกับข้างซอง
 * ยิงกล่องแล้วต้องได้ราคากล่องเลย ไม่ใช่ราคาซอง
 */
export function findByBarcode(
  products: Product[],
  code: string,
): { product: Product; unit: ProductUnit | null } | null {
  const q = code.trim()
  if (!q) return null
  const direct = products.find((p) => p.barcode === q)
  if (direct) return { product: direct, unit: null }
  for (const p of products) {
    const hit = unitsOf(p).find((u) => u.barcode === q)
    if (hit) return { product: p, unit: hit }
  }
  return null
}

/** ข้อความคงเหลือเป็นหน่วยใหญ่ลงหน่วยเล็ก เช่น "3 ลัง 2 กล่อง 5 ซอง" */
export function describeStock(product: Product, baseStock: number): string {
  const units = unitsOf(product)
  if (units.length === 0 || baseStock <= 0) return `${baseStock} ${product.unit}`
  const parts: string[] = []
  let left = baseStock
  for (const u of [...units].sort((a, b) => b.factor - a.factor)) {
    const n = Math.floor(left / u.factor)
    if (n > 0) {
      parts.push(`${n} ${u.unit_name}`)
      left -= n * u.factor
    }
  }
  if (left > 0 || parts.length === 0) parts.push(`${left} ${product.unit}`)
  return parts.join(' ')
}
