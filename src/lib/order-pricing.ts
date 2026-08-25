import { createAdminClient } from '@/lib/supabase/admin'
import { isClinicOnly } from '@/lib/clinic'
import { getReservedQuantities } from '@/lib/order-stock'

// คิดราคา/น้ำหนักของตะกร้าใหม่ฝั่ง server เสมอ — ราคาที่ส่งมาจาก browser เชื่อไม่ได้

export interface CartInput {
  productId: string
  quantity: number
}

export interface PricedLine {
  product_id: string
  product_name: string
  unit: string
  unit_price: number
  quantity: number
  subtotal: number
  weight_grams: number
}

export type PricedCart =
  | {
      ok: true
      lines: PricedLine[]
      subtotal: number
      weightGrams: number
      /** สินค้าที่ยังไม่ได้ตั้งน้ำหนัก — คิดค่าส่งไม่ได้ (ยังให้มารับที่ร้านได้) */
      missingWeight: string[]
    }
  | { ok: false; error: string }

interface Row {
  id: string
  name: string
  price: number
  unit: string
  weight_grams: number | null
  is_service: boolean
  active: boolean
  online_available: boolean
  clinic_only: boolean | null
  categories: { clinic_only: boolean } | null
  product_lots: { quantity: number }[] | null
}

export async function priceCart(items: CartInput[]): Promise<PricedCart> {
  const wanted = items
    .map((i) => ({ productId: String(i.productId), quantity: Math.floor(Number(i.quantity)) }))
    .filter((i) => i.productId && i.quantity > 0)

  if (wanted.length === 0) return { ok: false, error: 'ตะกร้าว่าง' }

  const admin = createAdminClient()
  const reserved = await getReservedQuantities()
  const { data, error } = await admin
    .from('products')
    .select(
      'id, name, price, unit, weight_grams, is_service, active, online_available, clinic_only, categories(clinic_only), product_lots(quantity)'
    )
    .in('id', wanted.map((i) => i.productId))

  if (error) return { ok: false, error: error.message }

  const rows = (data ?? []) as unknown as Row[]
  const lines: PricedLine[] = []
  const missingWeight: string[] = []

  for (const item of wanted) {
    const row = rows.find((r) => r.id === item.productId)
    if (!row || !row.active || !row.online_available || isClinicOnly(row)) {
      return { ok: false, error: 'มีสินค้าในตะกร้าที่ไม่เปิดขายบนเว็บแล้ว — กรุณาลบออกจากตะกร้า' }
    }

    if (!row.is_service) {
      // หักของที่ค้างอยู่ในออเดอร์คนอื่นที่ยังไม่ตัดสต็อคออกก่อน
      const stock = (row.product_lots ?? []).reduce((sum, lot) => sum + (lot.quantity ?? 0), 0)
      const available = Math.max(0, stock - (reserved.get(row.id) ?? 0))
      if (available < item.quantity) {
        return {
          ok: false,
          error: available === 0
            ? `"${row.name}" หมดพอดี — กรุณาลบออกจากตะกร้า`
            : `"${row.name}" เหลือ ${available} ${row.unit} — กรุณาลดจำนวน`,
        }
      }
    }

    if (!row.is_service && row.weight_grams == null) missingWeight.push(row.name)

    const price = Number(row.price)
    lines.push({
      product_id: row.id,
      product_name: row.name,
      unit: row.unit,
      unit_price: price,
      quantity: item.quantity,
      subtotal: price * item.quantity,
      weight_grams: (row.weight_grams ?? 0) * item.quantity,
    })
  }

  return {
    ok: true,
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.subtotal, 0),
    weightGrams: lines.reduce((sum, l) => sum + l.weight_grams, 0),
    missingWeight,
  }
}
