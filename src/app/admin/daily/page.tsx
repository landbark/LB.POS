import { createClient } from '@/lib/supabase/server'
import { paymentLines, type PaidTransaction } from '@/lib/payments'
import DailySummaryClient, { type ShiftSummary } from './DailySummaryClient'

// วันของร้านอิงเวลาไทย (UTC+7) — server บน Vercel เป็น UTC ใช้วันจาก toISOString ตรงๆ ไม่ได้
const thaiToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

export default async function DailySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: dateParam } = await searchParams
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : thaiToday()

  const startISO = new Date(`${date}T00:00:00+07:00`).toISOString()
  const endISO = new Date(new Date(startISO).getTime() + 24 * 3600 * 1000).toISOString()

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
      .select('total')
      .eq('status', 'cancelled')
      .gte('cancelled_at', startISO)
      .lt('cancelled_at', endISO),
    supabase
      .from('transaction_items')
      .select('quantity, subtotal, product_id, products(name, unit), transactions!inner(status, created_at)')
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

  const netTotal = completedTx?.reduce((s, t) => s + t.total, 0) ?? 0
  const discountTotal = completedTx?.reduce((s, t) => s + (t.discount ?? 0), 0) ?? 0

  // บิลที่แยกจ่ายนับยอดเข้าทุกช่องทางที่รับมา ส่วน count นับใบ (ใบเดียวโผล่ได้หลายช่องทาง)
  const byMethodMap: Record<string, { amount: number; count: number }> = {}
  for (const t of completedTx ?? []) {
    for (const line of paymentLines(t as PaidTransaction)) {
      const m = (byMethodMap[line.method] ??= { amount: 0, count: 0 })
      m.amount += line.amount
      m.count += 1
    }
  }
  const byMethod = Object.entries(byMethodMap)
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.amount - a.amount)

  const byChannelMap: Record<string, { amount: number; count: number }> = {}
  for (const t of completedTx ?? []) {
    const c = (byChannelMap[t.sales_channel ?? 'store'] ??= { amount: 0, count: 0 })
    c.amount += t.total
    c.count += 1
  }
  const byChannel = Object.entries(byChannelMap)
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.amount - a.amount)

  const productMap: Record<string, { name: string; unit: string; qty: number; revenue: number }> = {}
  for (const it of (items ?? []) as unknown as { quantity: number; subtotal: number; product_id: string; products: { name: string; unit: string } | null }[]) {
    const p = (productMap[it.product_id] ??= {
      name: it.products?.name ?? 'สินค้าที่ถูกลบ',
      unit: it.products?.unit ?? '',
      qty: 0,
      revenue: 0,
    })
    p.qty += it.quantity
    p.revenue += it.subtotal
  }
  const bestSellers = Object.values(productMap).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)

  return (
    <DailySummaryClient
      date={date}
      today={thaiToday()}
      netTotal={netTotal}
      txCount={completedTx?.length ?? 0}
      discountTotal={discountTotal}
      cancelledCount={cancelledTx?.length ?? 0}
      cancelledTotal={cancelledTx?.reduce((s, t) => s + t.total, 0) ?? 0}
      byMethod={byMethod}
      byChannel={byChannel}
      bestSellers={bestSellers}
      shifts={(shifts as unknown as ShiftSummary[]) ?? []}
    />
  )
}
