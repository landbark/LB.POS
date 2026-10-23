import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductUnit } from '@/lib/types'
import { unitsOf, type UnitChoice } from '@/lib/productUnits'

/**
 * ตรรกะการนับสต็อก — ใช้ร่วมกันระหว่างหน้านับ (เบราว์เซอร์) กับตอนยืนยันปรับสต็อก (เซิร์ฟเวอร์)
 *
 * ส่วนต่างคิดจาก "ยอดระบบ ณ ตอนนับ" ไม่ใช่ยอดตอนกดยืนยัน เพราะระหว่างนับร้านยังขายอยู่
 * นับได้ 10 ตอนระบบมี 12 (ขาด 2) แล้วขายไปอีก 1 ก่อนกดยืนยัน ของจริงต้องเหลือ 9
 * ถ้าไปเทียบกับยอดตอนยืนยัน (11) จะกลายเป็นขาดแค่ 1 — ของที่ขายไปหายจากส่วนต่าง
 */

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
  product_lots?: { quantity: number }[] | null
  product_units?: ProductUnit[] | null
}

/** ยอดคงเหลือหน่วยฐานของสินค้า (รวมทุก lot) */
export const stockOf = (product: { product_lots?: { quantity: number }[] | null }) =>
  (product.product_lots ?? []).reduce((sum, l) => sum + l.quantity, 0)

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
}

interface Lot {
  id: string
  quantity: number
  expiry_date: string | null
}

/** ใกล้หมดอายุก่อน — ไม่มีวันหมดอายุไปอยู่ท้ายสุด (FEFO เหมือนตอนขาย) */
const byFefo = (a: Lot, b: Lot) => {
  if (!a.expiry_date && !b.expiry_date) return 0
  if (!a.expiry_date) return 1
  if (!b.expiry_date) return -1
  return a.expiry_date.localeCompare(b.expiry_date)
}

/**
 * ปรับสต็อกสินค้าหนึ่งตัวตามส่วนต่างที่นับได้ แล้วลงประวัติใน stock_movements
 *
 * ของเกิน → ลงที่ lot ใกล้หมดอายุที่สุด (ไม่มี lot เลยก็สร้างให้)
 * ของขาด → ตัดไล่จาก lot ใกล้หมดอายุที่สุดไปเรื่อย ๆ และหยุดที่ 0 ไม่ปล่อยให้ติดลบ
 * (ติดลบเกิดได้จากการขายแทรกระหว่างนับ — คืนค่า shortfall ไว้ให้หน้าจอบอกผู้ใช้)
 */
export async function applyCountDiff(
  supabase: SupabaseClient,
  { productId, diff, reason, createdBy }: { productId: string; diff: number; reason: string; createdBy: string | null }
): Promise<ApplyDiffResult> {
  if (diff === 0) return { applied: 0, shortfall: 0 }

  const { data } = await supabase
    .from('product_lots')
    .select('id, quantity, expiry_date')
    .eq('product_id', productId)
  const lots = ((data ?? []) as Lot[]).sort(byFefo)

  const movement = (lotId: string, type: 'adjust_in' | 'adjust_out', quantity: number) =>
    supabase.from('stock_movements').insert({
      product_id: productId,
      product_lot_id: lotId,
      type,
      quantity,
      reason,
      created_by: createdBy,
    })

  if (diff > 0) {
    let lotId = lots[0]?.id ?? null
    const current = lots[0]?.quantity ?? 0

    if (!lotId) {
      // สินค้าไม่เคยมี lot (ของที่ไม่เคยรับเข้าระบบ แต่มีอยู่บนชั้น) — สร้าง lot รับยอดที่นับได้
      const { data: created } = await supabase
        .from('product_lots')
        .insert({ product_id: productId, lot_number: 'นับสต็อก', expiry_date: null, quantity: 0, initial_quantity: 0 })
        .select('id')
        .single()
      lotId = created?.id ?? null
    }
    if (!lotId) return { applied: 0, shortfall: 0 }

    await supabase.from('product_lots').update({ quantity: current + diff }).eq('id', lotId)
    await movement(lotId, 'adjust_in', diff)
    return { applied: diff, shortfall: 0 }
  }

  let remaining = -diff
  for (const lot of lots) {
    if (remaining <= 0) break
    if (lot.quantity <= 0) continue
    const take = Math.min(remaining, lot.quantity)
    await supabase.from('product_lots').update({ quantity: lot.quantity - take }).eq('id', lot.id)
    await movement(lot.id, 'adjust_out', take)
    remaining -= take
  }

  return { applied: diff + remaining, shortfall: remaining }
}
