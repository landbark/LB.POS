import type { SupabaseClient } from '@supabase/supabase-js'
import type { CartItem, StockMovementType } from '@/lib/types'

interface Lot {
  id: string
  quantity: number
  expiry_date: string | null
}

interface DeductOptions {
  /** ผูกกับใบเสร็จ (การขาย) — ตัดสต็อกออกเฉยๆ ไม่มีใบเสร็จ ส่ง null */
  transactionId: string | null
  type: StockMovementType
  /** ข้อความที่จะขึ้นในประวัติสต็อค เช่น เลขที่บิล หรือเหตุผลที่ตัดออก */
  reason: string
  createdBy: string | null
}

/**
 * ตัดสต็อกตามตะกร้าแบบ FEFO (ล็อตที่ใกล้หมดอายุก่อน) พร้อมลงประวัติใน stock_movements
 *
 * ใช้ร่วมกันทั้งตอนขายและตอนตัดสต็อกออกเฉยๆ — ตรรกะเดียวกันต้องอยู่ที่เดียว
 * ไม่งั้นแก้ที่หนึ่งแล้วลืมอีกที่
 */
export async function deductStock(
  supabase: SupabaseClient,
  cart: CartItem[],
  { transactionId, type, reason, createdBy }: DeductOptions
): Promise<void> {
  for (const item of cart) {
    let remaining = item.quantity
    const lots = ((item.product.product_lots ?? []) as Lot[])
      .filter((l) => l.quantity > 0)
      .sort((a, b) => {
        if (!a.expiry_date) return 1
        if (!b.expiry_date) return -1
        return a.expiry_date.localeCompare(b.expiry_date)
      })

    for (const lot of lots) {
      if (remaining <= 0) break
      const deduct = Math.min(remaining, lot.quantity)
      await supabase.from('product_lots').update({ quantity: lot.quantity - deduct }).eq('id', lot.id)
      await supabase.from('stock_movements').insert({
        product_id: item.product.id,
        product_lot_id: lot.id,
        transaction_id: transactionId,
        type,
        quantity: deduct,
        reason,
        created_by: createdBy,
      })
      remaining -= deduct
    }

    // ตัดเกินสต็อค — ของมีจริงบนชั้นแต่ยอดในระบบหมด ตัดต่อให้ติดลบไว้ฟ้องว่าต้องไปนับสต็อคใหม่
    // (ต้องถอด CHECK (quantity >= 0) ออกจาก product_lots ก่อน ดู supabase-migration-oversell.sql)
    if (remaining > 0 && !item.product.is_service) {
      const { data: fallback } = await supabase
        .from('product_lots')
        .select('id, quantity')
        .eq('product_id', item.product.id)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      let lotId: string | null = fallback?.id ?? null
      let current = fallback?.quantity ?? 0
      if (!lotId) {
        // สินค้าไม่เคยมีล็อตเลย — สร้างล็อตไว้รับยอดติดลบ จะได้คืนของได้ตอนยกเลิกบิล
        const { data: created } = await supabase
          .from('product_lots')
          .insert({ product_id: item.product.id, lot_number: 'OVERSELL', expiry_date: null, quantity: 0, initial_quantity: 0 })
          .select('id')
          .single()
        lotId = created?.id ?? null
        current = 0
      }

      if (lotId) {
        await supabase.from('product_lots').update({ quantity: current - remaining }).eq('id', lotId)
        await supabase.from('stock_movements').insert({
          product_id: item.product.id,
          product_lot_id: lotId,
          transaction_id: transactionId,
          type,
          quantity: remaining,
          reason: `${reason} (เกินสต็อค)`,
          created_by: createdBy,
        })
      }
    }
  }
}
