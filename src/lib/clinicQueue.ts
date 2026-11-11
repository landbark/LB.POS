import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClinicQueueItem, ClinicQueueVisit, Customer, Product } from './types'

/**
 * คิวเก็บเงินจากคลินิก — หมอกด "ส่งไปเก็บเงิน" แล้วใบมาโผล่ที่หน้าขาย
 *
 * อยู่ตรงนี้เพราะมีคนดึงสองที่: หน้า /pos (ตอนโหลดหน้า) และ /api/pos/clinic-queue
 * (ที่หน้าขายถามซ้ำเป็นระยะ) — ถ้าปล่อยให้ต่างคนต่างเขียน select เองสักวันจะไม่ตรงกัน
 */

/** คอลัมน์ของสินค้าที่หน้าขายต้องใช้ครบ — ล็อตไว้ตัด FEFO, หน่วยไว้ขายเป็นกล่อง/ซอง */
export const POS_PRODUCT_SELECT = `
  *,
  categories(name, vat_applicable, clinic_only, earns_points),
  product_lots(id, quantity, expiry_date, lot_number),
  product_units!product_units_product_id_fkey(id, product_id, unit_name, factor, sku, barcode, price, cost, sellable_pos, sellable_online, purchasable, sort_order, active, created_at)
`

/** คอลัมน์ของใบตรวจรักษาที่คิวต้องใช้ — คู่กับ toQueueVisits() ข้างล่าง */
export const PENDING_VISIT_SELECT = 'id, visit_number, pets(name), customers(*), visit_items(id, product_id, quantity, unit_price, dosage)'

export interface PendingVisitRow {
  id: string
  visit_number: string
  pets: unknown
  customers: unknown
  visit_items: { product_id: string | null; quantity: number; unit_price: number; dosage: string | null }[] | null
}

/** ผูกสินค้าเต็มก้อนเข้ากับรายการที่หมอสั่งจ่าย — ตัวที่หาสินค้าไม่เจอ (ถูกลบทีหลัง) ข้ามไป */
export function toQueueVisits(rows: PendingVisitRow[], productById: Map<string, Product>): ClinicQueueVisit[] {
  return rows.map((v) => ({
    id: v.id,
    visit_number: v.visit_number,
    pet_name: (v.pets as { name: string } | null)?.name ?? '',
    customer: (v.customers as Customer | null) ?? null,
    items: (v.visit_items ?? [])
      .map((item) => ({
        quantity: item.quantity,
        unit_price: item.unit_price,
        dosage: item.dosage,
        product: item.product_id ? productById.get(item.product_id) : undefined,
      }))
      .filter((item): item is ClinicQueueItem => Boolean(item.product)),
  }))
}

/**
 * ใบที่รอเก็บเงินทั้งหมด พร้อมสินค้าเต็มก้อน
 *
 * ส่ง productById มาได้ถ้าฝั่งที่เรียกดึงสินค้าทั้งร้านไว้อยู่แล้ว (หน้า /pos)
 * ไม่ส่งมาก็จะดึงเฉพาะสินค้าที่ใบพวกนี้อ้างถึง — เบากว่ามากสำหรับการถามซ้ำทุกไม่กี่วินาที
 */
export async function fetchClinicQueue(
  supabase: SupabaseClient,
  productById?: Map<string, Product>,
): Promise<ClinicQueueVisit[]> {
  const { data } = await supabase
    .from('visits')
    .select(PENDING_VISIT_SELECT)
    .eq('status', 'pending_payment')
    .order('visit_date')

  const rows = (data ?? []) as PendingVisitRow[]
  if (rows.length === 0) return []
  if (productById) return toQueueVisits(rows, productById)

  const ids = [...new Set(
    rows.flatMap((v) => (v.visit_items ?? []).map((i) => i.product_id).filter((id): id is string => Boolean(id))),
  )]
  if (ids.length === 0) return toQueueVisits(rows, new Map())

  const { data: products } = await supabase.from('products').select(POS_PRODUCT_SELECT).in('id', ids)
  const map = new Map(((products ?? []) as Product[]).map((p) => [p.id, p]))
  return toQueueVisits(rows, map)
}
