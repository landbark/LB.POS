import { createClient } from '@/lib/supabase/server'
import { paymentLines, type PaidTransaction } from '@/lib/payments'
import { thaiToday, thaiDayRange } from '@/lib/thaiDate'
import { isOwnMoney, totalsByChannelGroup } from '@/lib/salesChannel'
import DailySummaryClient, { type ShiftSummary } from './DailySummaryClient'

export default async function DailySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: dateParam } = await searchParams
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : thaiToday()

  const { startISO, endISO } = thaiDayRange(date)

  const supabase = await createClient()
  const [{ data: completedTx }, { data: cancelledTx }, { data: items }, { data: shifts }, { data: returns }, { data: returnedItems }] = await Promise.all([
    supabase
      .from('transactions')
      .select('total, discount, payment_method, sales_channel, transaction_payments(method, amount)')
      .eq('status', 'completed')
      .gte('created_at', startISO)
      .lt('created_at', endISO),
    supabase
      .from('transactions')
      .select('total, sales_channel')
      .eq('status', 'cancelled')
      .gte('cancelled_at', startISO)
      .lt('cancelled_at', endISO),
    supabase
      .from('transaction_items')
      .select('base_quantity, subtotal, discount, is_reward, reward_points, product_id, products(name, unit), transactions!inner(status, created_at)')
      .eq('transactions.status', 'completed')
      .gte('transactions.created_at', startISO)
      .lt('transactions.created_at', endISO),
    // กะที่คาบเกี่ยวกับวันนั้น (เปิดก่อนสิ้นวัน และยังไม่ปิดหรือปิดหลังต้นวัน)
    supabase
      .from('shifts')
      .select(`
        id, opened_at, opening_cash, closed_at,
        expected_cash, closing_cash_counted, cash_difference, notes,
        opener:profiles!shifts_opened_by_fkey(name),
        closer:profiles!shifts_closed_by_fkey(name)
      `)
      .lt('opened_at', endISO)
      .or(`closed_at.is.null,closed_at.gte.${startISO}`)
      .order('opened_at', { ascending: true }),
    // ใบคืน/เปลี่ยนสินค้าของวันนั้น — ส่วนที่หักกับบิลใหม่ไม่ต้องหักซ้ำ (total ของบิลใหม่หักให้แล้ว)
    supabase
      .from('returns')
      .select('return_value, refund_amount, exchange_transaction_id')
      .gte('created_at', startISO)
      .lt('created_at', endISO),
    // ของที่รับคืนรายตัว — หักออกจากตาราง "ขายดีวันนี้" ไม่งั้นของที่ถูกเอามาคืนยังขึ้นเป็นขายดี
    supabase
      .from('return_items')
      .select('quantity, base_quantity, product_id, products(name, unit), transaction_items(subtotal, quantity), returns!inner(created_at)')
      .gte('returns.created_at', startISO)
      .lt('returns.created_at', endISO),
  ])

  // ยอดขายผ่านแพลตฟอร์มไม่ใช่เงินที่ร้านได้จริง (โดนหักค่าธรรมเนียม/ค่าส่ง) — แยกออกจากยอดสุทธิ
  // และจากวิธีชำระ ไปโชว์เป็นบรรทัดข้อมูลต่างหาก ตัวเลขการเงินจริงดูที่สรุปของแพลตฟอร์มเอง
  const ownTx = (completedTx ?? []).filter((t) => isOwnMoney(t.sales_channel))
  const platformTx = (completedTx ?? []).filter((t) => !isOwnMoney(t.sales_channel))
  const ownCancelled = (cancelledTx ?? []).filter((t) => isOwnMoney(t.sales_channel))

  const returnRows = returns ?? []
  const returnValueTotal = returnRows.reduce((s, r) => s + Number(r.return_value), 0)
  const returnRefundTotal = returnRows.reduce((s, r) => s + Number(r.refund_amount), 0)

  const netTotal = ownTx.reduce((s, t) => s + t.total, 0) - returnRefundTotal
  const discountTotal = ownTx.reduce((s, t) => s + (t.discount ?? 0), 0)

  // บิลที่แยกจ่ายนับยอดเข้าทุกช่องทางที่รับมา ส่วน count นับใบ (ใบเดียวโผล่ได้หลายช่องทาง)
  const byMethodMap: Record<string, { amount: number; count: number }> = {}
  for (const t of ownTx) {
    for (const line of paymentLines(t as PaidTransaction)) {
      const m = (byMethodMap[line.method] ??= { amount: 0, count: 0 })
      m.amount += line.amount
      m.count += 1
    }
  }
  const byMethod = Object.entries(byMethodMap)
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.amount - a.amount)

  // ช่องทางขายยังโชว์ครบทุกช่องทาง รวมแพลตฟอร์มด้วย — ตรงนี้ดูว่าขายออกทางไหนบ้าง ไม่ใช่เงินเข้า
  // จัดเป็นสามก้อน หน้าร้าน / ออกบูธ / ออนไลน์ แล้วกางรายช่องทางไว้ข้างใน
  const byGroup = totalsByChannelGroup(completedTx ?? [])

  const productMap: Record<string, { name: string; unit: string; qty: number; revenue: number }> = {}
  for (const it of (items ?? []) as unknown as { base_quantity: number; subtotal: number; product_id: string; products: { name: string; unit: string } | null }[]) {
    const p = (productMap[it.product_id] ??= {
      name: it.products?.name ?? 'สินค้าที่ถูกลบ',
      unit: it.products?.unit ?? '',
      qty: 0,
      revenue: 0,
    })
    p.qty += it.base_quantity
    p.revenue += it.subtotal
  }
  // หักของที่รับคืนออกจากยอดขายรายสินค้า ด้วย "ราคาในบิลเดิม" ให้ฐานเดียวกับยอดขายข้างบน
  for (const r of (returnedItems ?? []) as unknown as {
    quantity: number
    base_quantity: number
    product_id: string | null
    products: { name: string; unit: string } | null
    transaction_items: { subtotal: number; quantity: number } | null
  }[]) {
    if (!r.product_id) continue
    const p = (productMap[r.product_id] ??= {
      name: r.products?.name ?? 'สินค้าที่ถูกลบ',
      unit: r.products?.unit ?? '',
      qty: 0,
      revenue: 0,
    })
    p.qty -= r.base_quantity
    p.revenue -= r.transaction_items && r.transaction_items.quantity
      ? (r.transaction_items.subtotal / r.transaction_items.quantity) * r.quantity
      : 0
  }
  const bestSellers = Object.values(productMap)
    // ขายแล้วถูกคืนหมดในวันเดียวกัน = ไม่ต้องขึ้นเป็นแถวเปล่า
    .filter((p) => p.qty !== 0 || Math.abs(p.revenue) > 0.004)
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)

  // ของแลกแต้มบันทึกเป็นส่วนลดเต็มราคา (บรรทัด 0 บาท) — ตัวเลข "ส่วนลดรวม" จึงมีของแจกปนอยู่
  // แยกออกมาบอกไว้ ไม่งั้นเจ้าของเห็นส่วนลดพุ่งแล้วไปหาว่าใครกดลดราคา
  const rewardRows = ((items ?? []) as unknown as { discount: number; is_reward: boolean | null; reward_points: number | null }[])
    .filter((it) => it.is_reward)
  const rewardValue = rewardRows.reduce((s, it) => s + (it.discount ?? 0), 0)
  const rewardPoints = rewardRows.reduce((s, it) => s + (it.reward_points ?? 0), 0)

  return (
    <DailySummaryClient
      date={date}
      today={thaiToday()}
      netTotal={netTotal}
      txCount={ownTx.length}
      discountTotal={discountTotal}
      rewardValue={rewardValue}
      rewardPoints={rewardPoints}
      cancelledCount={ownCancelled.length}
      cancelledTotal={ownCancelled.reduce((s, t) => s + t.total, 0)}
      returnCount={returnRows.length}
      returnValueTotal={returnValueTotal}
      returnRefundTotal={returnRefundTotal}
      platformTotal={platformTx.reduce((s, t) => s + t.total, 0)}
      platformCount={platformTx.length}
      byMethod={byMethod}
      byGroup={byGroup}
      bestSellers={bestSellers}
      shifts={(shifts as unknown as ShiftSummary[]) ?? []}
    />
  )
}
