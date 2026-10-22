import type { SupabaseClient } from '@supabase/supabase-js'
import type { CartItem, Product } from '@/lib/types'
import { deductStock } from '@/lib/deductStock'

export interface MissingLine {
  product_id: string
  /** จำนวนที่หายไป = (เอาไป − ขายได้) − คืนจริง */
  quantity: number
}

export interface CloseBoothTripInput {
  tripId: string
  tripNumber: string
  /** ของที่หายจากรอบนี้ — ส่งเฉพาะแถวที่ quantity > 0 */
  missing: MissingLine[]
  cashCounted: number | null
  closedBy: string | null
}

/**
 * ปิดรอบออกบูธ
 *
 * ของที่ยกไปไม่ได้ถูกตัดสต็อกตอนเบิก (ขายได้ค่อยตัดแบบ FEFO เหมือนขายหน้าร้าน) ตอนปิดรอบจึง
 * เหลือแค่ส่วนที่หายระหว่างงาน — ตัดออกเป็น adjust_out ให้ยอดในระบบตรงกับของที่ขนกลับมาจริง
 *
 * จองสิทธิ์ปิดรอบก่อน (update ... WHERE status='open') แล้วค่อยตัดของหาย — กดปิดซ้ำ/สองเครื่อง
 * พร้อมกันจะมีแค่ครั้งแรกที่ได้ตัด ตัดซ้ำสองรอบแก้ยากกว่าตัดไม่ครบมาก
 */
export async function closeBoothTrip(
  supabase: SupabaseClient,
  { tripId, tripNumber, missing, cashCounted, closedBy }: CloseBoothTripInput,
): Promise<{ error?: string }> {
  const lines = missing.filter((m) => m.quantity > 0)

  const { data: claimed, error: claimError } = await supabase
    .from('booth_trips')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: closedBy,
      cash_counted: cashCounted,
    })
    .eq('id', tripId)
    .eq('status', 'open')
    .select('id')
  if (claimError) return { error: claimError.message }
  if (!claimed || claimed.length === 0) return { error: 'รอบนี้ถูกปิดไปแล้ว — ลองรีเฟรชหน้า' }

  if (lines.length > 0) {
    // ดึงล็อตสดตอนนี้ ไม่ใช้ของที่โหลดมาตอนเปิดหน้า — ระหว่างนั้นหน้าร้านขายไปอีกหลายบิลแล้ว
    const { data: products, error } = await supabase
      .from('products')
      .select('*, product_lots(id, quantity, expiry_date)')
      .in('id', lines.map((m) => m.product_id))
    // ปิดรอบไปแล้ว บอกให้ไปตัดเองดีกว่าปล่อยเงียบ
    if (error) return { error: `ปิดรอบแล้ว แต่ตัดของหายไม่สำเร็จ: ${error.message}` }

    const byId = new Map((products ?? []).map((p) => [p.id, p as Product]))
    const cart = lines.flatMap<CartItem>((m) => {
      const product = byId.get(m.product_id)
      if (!product) return []  // สินค้าถูกลบไปแล้ว — ข้าม ปิดรอบต่อได้
      return [{
        product,
        // ของหายที่บูธนับเป็นหน่วยฐานตามใบเบิก
        unit: null,
        quantity: m.quantity,
        unit_price: 0,
        discount: 0,
        manual_discount: 0,
        discount_mode: 'amount',
        discount_value: 0,
        subtotal: 0,
        lot_id: null,
      }]
    })

    await deductStock(supabase, cart, {
      transactionId: null,
      type: 'adjust_out',
      reason: `ของหายจากงานออกบูธ ${tripNumber}`,
      createdBy: closedBy,
    })
  }

  return {}
}
