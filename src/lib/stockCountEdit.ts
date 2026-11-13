import type { SupabaseClient } from '@supabase/supabase-js'
import { applyCountDiff } from '@/lib/stockCount'
import type { StockCountEdit, StockCountEditField, StockCountStatus } from '@/lib/types'

/**
 * แก้รอบนับสต็อกที่ปิดไปแล้ว
 *
 * ตรรกะที่ต้องใช้ทั้งฝั่ง API (ลงมือแก้) และฝั่งหน้าจอ (อธิบายประวัติการแก้)
 * อยู่ที่ไฟล์นี้ด้วยกัน ไม่งั้นคำอธิบายในล็อกกับสิ่งที่ระบบทำจริงจะค่อย ๆ หลุดกัน
 *
 * ใครแก้อะไรได้ (ดู canEditStock / needsApproval)
 *   • ชื่อรอบ / หมายเหตุรอบ — พนักงานทุกคน ทุกสถานะ (ไม่กระทบตัวเลขอะไร)
 *   • จำนวนที่นับได้ของรอบที่ยังนับอยู่ — แก้ตรงจากหน้านับได้เลยเหมือนเดิม ไม่ผ่านที่นี่
 *   • จำนวนที่นับได้ของรอบที่ปรับสต็อกแล้ว — เจ้าของร้านแก้ได้เลย (สต็อกขยับตามส่วนต่าง),
 *     พนักงานส่งเป็นคำขอรออนุมัติ แล้วเจ้าของร้านได้แจ้งเตือน
 *   • รอบที่ยกเลิกไปแล้ว — ไม่เคยปรับสต็อก แก้ตัวเลขจึงไม่แตะของในร้าน
 */

export const EDIT_FIELD_LABELS: Record<StockCountEditField, string> = {
  name: 'ชื่อรอบ',
  note: 'หมายเหตุรอบ',
  counted_quantity: 'จำนวนที่นับได้',
  item_note: 'หมายเหตุรายการ',
  status: 'สถานะรอบ',
}

/** รอบที่ปรับสต็อกไปแล้ว — แก้จำนวนแปลว่าของในร้านต้องขยับตาม */
export const touchesStock = (status: StockCountStatus) => status === 'posted'

/** พนักงานที่ไม่ใช่เจ้าของร้านต้องขออนุมัติก่อนไหม */
export const needsApproval = (status: StockCountStatus, role: string) =>
  touchesStock(status) && role !== 'admin'

/** เปิดรอบที่ยกเลิกไว้กลับมานับต่อได้เฉพาะเจ้าของร้าน */
export const canReopen = (status: StockCountStatus, role: string) =>
  status === 'cancelled' && role === 'admin'

/**
 * ส่วนต่างที่ต้องปรับเข้าสต็อกเพิ่มเมื่อแก้จำนวนที่นับได้
 *
 * ไม่ใช่ "ของใหม่ลบของเก่า" ตรง ๆ เพราะตอนกดยืนยันครั้งแรกระบบอาจปรับได้ไม่ครบ
 * (ของในระบบเหลือน้อยกว่าส่วนต่าง เพราะขายไประหว่างนับ — applied_diff จึงไม่เท่า
 * ส่วนต่างที่ตั้งใจ) ต้องคิดจากที่ "ปรับไปแล้วจริง" ไม่ใช่จากที่ตั้งใจจะปรับ
 */
export function stockDeltaFor(
  item: { counted_quantity: number; system_quantity: number; applied_diff: number | null },
  nextCounted: number
): number {
  const intended = nextCounted - item.system_quantity
  return intended - (item.applied_diff ?? 0)
}

interface EditableItem {
  id: string
  product_id: string
  product_lot_id: string | null
  counted_quantity: number
  system_quantity: number
  applied_diff: number | null
}

/**
 * ลงมือแก้จำนวนที่นับได้ของแถวหนึ่ง — ปรับสต็อกตามส่วนต่างที่เปลี่ยน ถ้ารอบนั้นปรับไปแล้ว
 *
 * ไม่ส่ง expiryDate เข้า applyCountDiff เพราะวันหมดอายุถูกเขียนลง lot ไปตอนยืนยันแล้ว
 * การแก้จำนวนไม่ใช่เหตุให้ไปเขียนทับอีกครั้ง
 */
export async function applyCountedQuantityEdit(
  admin: SupabaseClient,
  {
    count,
    item,
    nextCounted,
    staffId,
    staffName,
  }: {
    count: { id: string; count_number: string; status: StockCountStatus }
    item: EditableItem
    nextCounted: number
    staffId: string | null
    staffName: string | null
  }
): Promise<{ stockDelta: number | null; applied: number; shortfall: number }> {
  if (!touchesStock(count.status)) {
    // รอบที่ยกเลิกไว้ไม่เคยแตะสต็อก — แก้ได้แต่ตัวเลขในรอบ
    await admin
      .from('stock_count_items')
      .update({ counted_quantity: nextCounted })
      .eq('id', item.id)
    return { stockDelta: null, applied: 0, shortfall: 0 }
  }

  const delta = stockDeltaFor(item, nextCounted)

  if (delta === 0) {
    await admin
      .from('stock_count_items')
      .update({ counted_quantity: nextCounted })
      .eq('id', item.id)
    return { stockDelta: 0, applied: 0, shortfall: 0 }
  }

  const { applied, shortfall } = await applyCountDiff(admin, {
    productId: item.product_id,
    lotId: item.product_lot_id,
    diff: delta,
    reason: `แก้ผลนับ ${count.count_number}${staffName ? ` โดย ${staffName}` : ''}`,
    createdBy: staffId,
  })

  await admin
    .from('stock_count_items')
    .update({
      counted_quantity: nextCounted,
      applied_diff: (item.applied_diff ?? 0) + applied,
    })
    .eq('id', item.id)

  return { stockDelta: applied, applied, shortfall }
}

/** หนึ่งบรรทัดในแผงประวัติการแก้ — "นับได้ 10 → 100" */
export function describeEdit(edit: StockCountEdit): string {
  const from = edit.old_value ?? '—'
  const to = edit.new_value ?? '—'
  const what = edit.products?.name
    ? `${EDIT_FIELD_LABELS[edit.field]} · ${edit.products.name}`
    : EDIT_FIELD_LABELS[edit.field]
  return `${what}: ${from} → ${to}`
}
