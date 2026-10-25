import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductUnit } from '@/lib/types'
import { unitsOf, type UnitChoice } from '@/lib/productUnits'

/**
 * ตรรกะการนับสต็อก — ใช้ร่วมกันระหว่างหน้านับ (เบราว์เซอร์) กับตอนยืนยันปรับสต็อก (เซิร์ฟเวอร์)
 *
 * ส่วนต่างคิดจาก "ยอดระบบ ณ ตอนนับ" ไม่ใช่ยอดตอนกดยืนยัน เพราะระหว่างนับร้านยังขายอยู่
 * นับได้ 10 ตอนระบบมี 12 (ขาด 2) แล้วขายไปอีก 1 ก่อนกดยืนยัน ของจริงต้องเหลือ 9
 * ถ้าไปเทียบกับยอดตอนยืนยัน (11) จะกลายเป็นขาดแค่ 1 — ของที่ขายไปหายจากส่วนต่าง
 *
 * นับได้สองแบบ: นับรวมทุก lot (ค่าเริ่มต้น — ปรับส่วนต่างแบบ FEFO) หรือนับแยก lot
 * เมื่อสินค้ามีหลาย lot แล้วอยากให้ส่วนต่างลงที่ lot ที่ถูกตัว
 */

/** lot เท่าที่หน้านับต้องรู้ */
export interface CountLot {
  id: string
  lot_number: string | null
  expiry_date: string | null
  quantity: number
}

/** สินค้าเท่าที่หน้านับต้องรู้ — หน้านับโหลดสินค้าทั้งร้าน จึงดึงเฉพาะคอลัมน์ที่ใช้ */
export interface CountableProduct {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  unit: string
  price: number
  cost: number | null
  category_id: string | null
  product_lots?: CountLot[] | null
  product_units?: ProductUnit[] | null
}

/** ยอดคงเหลือหน่วยฐานของสินค้า (รวมทุก lot) */
export const stockOf = (product: { product_lots?: { quantity: number }[] | null }) =>
  (product.product_lots ?? []).reduce((sum, l) => sum + l.quantity, 0)

/** ใกล้หมดอายุก่อน — ไม่มีวันหมดอายุไปอยู่ท้ายสุด (FEFO เหมือนตอนขาย) */
const byFefo = (a: { expiry_date: string | null }, b: { expiry_date: string | null }) => {
  if (!a.expiry_date && !b.expiry_date) return 0
  if (!a.expiry_date) return 1
  if (!b.expiry_date) return -1
  return a.expiry_date.localeCompare(b.expiry_date)
}

/**
 * lot ที่ยังมีของ เรียงแบบ FEFO — ใช้ตัดสินว่าจะโผล่ตัวเลือก lot ให้คนนับไหม
 *
 * สินค้าเกือบทั้งร้านมี lot เดียว ตัวเลือกที่มีทางเลือกเดียวคือภาระเปล่า ๆ
 * จึงโผล่เฉพาะตอนมีของจริงมากกว่าหนึ่ง lot
 */
export const lotsWithStock = (product: CountableProduct): CountLot[] =>
  (product.product_lots ?? []).filter((l) => l.quantity > 0).sort(byFefo)

/**
 * lot ที่จะเขียนวันหมดอายุลงไปได้แน่ ๆ ตอนนับรวมทุก lot
 *
 * มี lot เดียว = วันที่บนกล่องเป็นของ lot นั้น; หลาย lot = บอกไม่ได้ว่าของ lot ไหน
 * (ยังไม่มี lot เลย ก็ยังกรอกได้ — ไปลงที่ lot ที่ระบบสร้างให้ตอนยืนยัน)
 */
export const canStampExpiry = (product: CountableProduct, lotId: string | null) =>
  lotId != null || lotsWithStock(product).length <= 1

/** ตัวเลือกหน่วยตอนนับ — ยิงบาร์โค้ดลังก็นับเป็นลังได้ ไม่สนว่าเปิดขาย/สั่งซื้อไว้ไหม */
export function countUnitChoices(product: CountableProduct): UnitChoice[] {
  const base: UnitChoice = { unit: null, name: product.unit, factor: 1, price: product.price, cost: product.cost }
  const packs = unitsOf(product).map((u) => ({
    unit: u,
    name: u.unit_name,
    factor: u.factor,
    price: u.price ?? product.price * u.factor,
    cost: u.cost ?? (product.cost == null ? null : product.cost * u.factor),
  }))
  return [base, ...packs]
}

export interface CountRow {
  counted_quantity: number
  system_quantity: number
}

/** ขาด (-) / เกิน (+) เป็นหน่วยฐาน */
export const varianceOf = (row: CountRow) => row.counted_quantity - row.system_quantity

/** มูลค่าส่วนต่างตามราคาทุน — ไม่ได้ตั้งทุนไว้ = คิดเป็น 0 ไม่ใช่เดาจากราคาขาย */
export const varianceValue = (row: CountRow, cost: number | null | undefined) =>
  varianceOf(row) * (cost ?? 0)

export interface CountSummary {
  items: number
  short: number
  over: number
  matched: number
  netValue: number
}

export function summarize(rows: (CountRow & { cost: number | null })[]): CountSummary {
  let short = 0, over = 0, matched = 0, netValue = 0
  for (const r of rows) {
    const diff = varianceOf(r)
    if (diff < 0) short += 1
    else if (diff > 0) over += 1
    else matched += 1
    netValue += varianceValue(r, r.cost)
  }
  return { items: rows.length, short, over, matched, netValue }
}

export interface ApplyDiffResult {
  /** ปรับเข้าสต็อกได้จริงเท่าไหร่ (+ เพิ่ม / - ลด) */
  applied: number
  /** ลดไม่ครบกี่ชิ้น เพราะของในระบบเหลือน้อยกว่าส่วนต่าง (ขายไประหว่างนับ) */
  shortfall: number
  /** เขียนวันหมดอายุที่อ่านจากกล่องลง lot ไปแล้วหรือเปล่า */
  stamped: boolean
}

interface Lot {
  id: string
  quantity: number
  expiry_date: string | null
}

/**
 * ปรับสต็อกตามส่วนต่างที่นับได้ แล้วลงประวัติใน stock_movements
 *
 * นับแยก lot (ส่ง lotId) → บวก/ลบที่ lot นั้นตรง ๆ ไม่ไล่ FEFO
 * นับรวมทุก lot → ของเกินลงที่ lot ใกล้หมดอายุที่สุด (ไม่มี lot เลยก็สร้างให้),
 *                 ของขาดตัดไล่จาก lot ใกล้หมดอายุที่สุดไปเรื่อย ๆ
 *
 * ทั้งสองแบบหยุดที่ 0 ไม่ปล่อยให้ติดลบ (ติดลบเกิดได้จากการขายแทรกระหว่างนับ —
 * คืนค่า shortfall ไว้ให้หน้าจอบอกผู้ใช้)
 *
 * expiryDate ที่อ่านจากกล่องตอนนับจะทับของเดิมใน lot เพราะของที่ถืออยู่ในมือ
 * เชื่อได้กว่าที่เคยคีย์ไว้ตอนรับเข้า (ซึ่ง 96% ไม่ได้กรอกเลย)
 */
export async function applyCountDiff(
  supabase: SupabaseClient,
  {
    productId,
    lotId = null,
    diff,
    expiryDate = null,
    reason,
    createdBy,
  }: {
    productId: string
    lotId?: string | null
    diff: number
    expiryDate?: string | null
    reason: string
    createdBy: string | null
  }
): Promise<ApplyDiffResult> {
  const { data } = await supabase
    .from('product_lots')
    .select('id, quantity, expiry_date')
    .eq('product_id', productId)
  const lots = ((data ?? []) as Lot[]).sort(byFefo)

  const movement = (lot: string, type: 'adjust_in' | 'adjust_out', quantity: number) =>
    supabase.from('stock_movements').insert({
      product_id: productId,
      product_lot_id: lot,
      type,
      quantity,
      reason,
      created_by: createdBy,
    })

  let stamped = false
  const stampExpiry = async (lot: string | null) => {
    if (!lot || !expiryDate) return
    await supabase.from('product_lots').update({ expiry_date: expiryDate }).eq('id', lot)
    stamped = true
  }

  // นับแยก lot — ส่วนต่างเป็นของ lot นั้นตัวเดียว lot อื่นของสินค้านี้ไม่ถูกแตะ
  if (lotId) {
    const lot = lots.find((l) => l.id === lotId)
    // lot ถูกลบทิ้งหลังนับแต่ก่อนกดยืนยัน — ไม่มีอะไรให้ปรับ
    if (!lot) return { applied: 0, shortfall: 0, stamped }

    await stampExpiry(lot.id)
    if (diff === 0) return { applied: 0, shortfall: 0, stamped }

    const next = Math.max(0, lot.quantity + diff)
    const applied = next - lot.quantity
    if (applied !== 0) {
      await supabase.from('product_lots').update({ quantity: next }).eq('id', lot.id)
      await movement(lot.id, applied > 0 ? 'adjust_in' : 'adjust_out', Math.abs(applied))
    }
    return { applied, shortfall: applied - diff, stamped }
  }

  // นับรวมทุก lot — เขียนวันหมดอายุได้เฉพาะตอนของอยู่ lot เดียว ไม่งั้นไม่รู้ว่าของ lot ไหน
  // (lot ที่ของหมดแล้วไม่นับ ต้องตรงกับเงื่อนไขที่หน้าจอโผล่ช่องวันหมดอายุให้กรอก)
  const stocked = lots.filter((l) => l.quantity > 0)
  const soleLot = stocked.length <= 1 ? stocked[0]?.id ?? lots[0]?.id ?? null : null

  if (diff === 0) {
    await stampExpiry(soleLot)
    return { applied: 0, shortfall: 0, stamped }
  }

  if (diff > 0) {
    let lot = lots[0]?.id ?? null
    const current = lots[0]?.quantity ?? 0

    if (!lot) {
      // สินค้าไม่เคยมี lot (ของที่ไม่เคยรับเข้าระบบ แต่มีอยู่บนชั้น) — สร้าง lot รับยอดที่นับได้
      const { data: created } = await supabase
        .from('product_lots')
        .insert({ product_id: productId, lot_number: 'นับสต็อก', expiry_date: expiryDate, quantity: 0, initial_quantity: 0 })
        .select('id')
        .single()
      lot = created?.id ?? null
      // lot ที่เพิ่งสร้างรับวันหมดอายุไปตอน insert แล้ว
      if (lot && expiryDate) stamped = true
    } else {
      await stampExpiry(soleLot)
    }
    if (!lot) return { applied: 0, shortfall: 0, stamped }

    await supabase.from('product_lots').update({ quantity: current + diff }).eq('id', lot)
    await movement(lot, 'adjust_in', diff)
    return { applied: diff, shortfall: 0, stamped }
  }

  await stampExpiry(soleLot)

  let remaining = -diff
  for (const lot of lots) {
    if (remaining <= 0) break
    if (lot.quantity <= 0) continue
    const take = Math.min(remaining, lot.quantity)
    await supabase.from('product_lots').update({ quantity: lot.quantity - take }).eq('id', lot.id)
    await movement(lot.id, 'adjust_out', take)
    remaining -= take
  }

  return { applied: diff + remaining, shortfall: remaining, stamped }
}
