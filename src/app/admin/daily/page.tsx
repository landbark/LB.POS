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
  const [{ data: completedTx }, { data: cancelledTx }, { data: items }, { data: shifts }] = await Promise.all([
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
      .select('base_quantity, subtotal, product_id, products(name, unit), transactions!inner(status, created_at)')
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
  ])

  // ยอดขายผ่านแพลตฟอร์มไม่ใช่เงินที่ร้านได้จริง (โดนหักค่าธรรมเนียม/ค่าส่ง) — แยกออกจากยอดสุทธิ
  // และจากวิธีชำระ ไปโชว์เป็นบรรทัดข้อมูลต่างหาก ตัวเลขการเงินจริงดูที่สรุปของแพลตฟอร์มเอง
  const ownTx = (completedTx ?? []).filter((t) => isOwnMoney(t.sales_channel))
  const platformTx = (completedTx ?? []).filter((t) => !isOwnMoney(t.sales_channel))
  const ownCancelled = (cancelledTx ?? []).filter((t) => isOwnMoney(t.sales_channel))

  const netTotal = ownTx.reduce((s, t) => s + t.total, 0)
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
  const bestSellers = Object.values(productMap).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)

  return (
    <DailySummaryClient
      date={date}
      today={thaiToday()}
      netTotal={netTotal}
      txCount={ownTx.length}
      discountTotal={discountTotal}
      cancelledCount={ownCancelled.length}
      cancelledTotal={ownCancelled.reduce((s, t) => s + t.total, 0)}
      platformTotal={platformTx.reduce((s, t) => s + t.total, 0)}
      platformCount={platformTx.length}
      byMethod={byMethod}
      byGroup={byGroup}
      bestSellers={bestSellers}
      shifts={(shifts as unknown as ShiftSummary[]) ?? []}
    />
  )
}
