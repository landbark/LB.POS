import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaff } from '@/lib/require-staff'
import { applyCountDiff } from '@/lib/stockCount'

/**
 * ยืนยันผลนับสต็อก — ปรับ product_lots ตามส่วนต่าง แล้วลงประวัติใน stock_movements
 *
 * ทำที่ฝั่งเซิร์ฟเวอร์เพราะรอบนับหนึ่งรอบมีได้เป็นร้อยรายการ ปล่อยให้เบราว์เซอร์
 * ยิงทีละคำสั่งแล้วปิดแท็บกลางคัน จะได้สต็อกที่ปรับไปครึ่งเดียวโดยไม่มีใครรู้
 */

// ร้านมีสินค้าเกินพันตัว รอบนับใหญ่ ๆ ใช้เวลาหลายสิบวินาที
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const staff = await getStaff()
  if (!staff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { countId } = await request.json()
  if (!countId) return NextResponse.json({ error: 'ไม่พบรอบนับ' }, { status: 400 })

  const admin = createAdminClient()

  const { data: count } = await admin
    .from('stock_counts')
    .select('id, count_number, status')
    .eq('id', countId)
    .maybeSingle()

  if (!count) return NextResponse.json({ error: 'ไม่พบรอบนับ' }, { status: 404 })
  if (count.status !== 'counting') {
    return NextResponse.json({ error: 'รอบนับนี้ปิดไปแล้ว' }, { status: 400 })
  }

  const { data: items } = await admin
    .from('stock_count_items')
    .select('id, product_id, counted_quantity, system_quantity, note, products(name)')
    .eq('count_id', countId)

  type Item = {
    id: string
    product_id: string
    counted_quantity: number
    system_quantity: number
    note: string | null
    products: { name: string } | null
  }

  const rows = (items ?? []) as unknown as Item[]
  const shortfalls: { name: string; missing: number }[] = []
  let adjusted = 0

  for (const item of rows) {
    const diff = item.counted_quantity - item.system_quantity
    const reason = `นับสต็อก ${count.count_number}${item.note ? ` — ${item.note}` : ''}`

    const { applied, shortfall } = await applyCountDiff(admin, {
      productId: item.product_id,
      diff,
      reason,
      createdBy: staff.userId,
    })

    if (applied !== 0) adjusted += 1
    if (shortfall > 0) shortfalls.push({ name: item.products?.name ?? '—', missing: shortfall })

    await admin.from('stock_count_items').update({ applied_diff: applied }).eq('id', item.id)
  }

  const { error } = await admin
    .from('stock_counts')
    .update({ status: 'posted', posted_by: staff.userId, posted_at: new Date().toISOString() })
    .eq('id', countId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, adjusted, counted: rows.length, shortfalls })
}
