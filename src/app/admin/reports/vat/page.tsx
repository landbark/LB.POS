import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { OWN_MONEY_CHANNELS } from '@/lib/salesChannel'
import VatReportClient, { type DetailRow } from './VatReportClient'

// ปีตามเวลาไทย (server อยู่ UTC)
function thaiYearNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getFullYear()
}

export default async function VatReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { year: yearParam, month: monthParam } = await searchParams
  const currentYear = thaiYearNow()
  const year = Number(yearParam) || currentYear
  const month = Number(monthParam) >= 1 && Number(monthParam) <= 12 ? Number(monthParam) : null

  const supabase = await createClient()
  const [{ data: months, error }, { data: store }] = await Promise.all([
    supabase.rpc('vat_sales_by_month', { p_year: year }),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])

  // เจาะดูว่าเดือนนั้นยอดมาจากสินค้าตัวไหนบ้าง — คิดจากราคาสินค้าในบิล (ก่อนหักส่วนลดท้ายบิล)
  let detail: DetailRow[] = []
  if (month) {
    const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`).toISOString()
    const endMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
    const end = new Date(`${endMonth}T00:00:00+07:00`).toISOString()

    const items = await fetchAll<{
      quantity: number
      subtotal: number
      vat_applicable: boolean
      products: { name: string } | null
    }>((from, to) =>
      supabase
        .from('transaction_items')
        .select('quantity, subtotal, vat_applicable, products(name), transactions!inner(status, created_at, sales_channel)')
        .neq('transactions.status', 'cancelled')
        // ขายผ่านแพลตฟอร์มไม่นับเป็นยอดขายของร้าน — แพลตฟอร์มหักค่าธรรมเนียมแล้วมีสรุปการเงินของตัวเอง
        .in('transactions.sales_channel', OWN_MONEY_CHANNELS)
        .gte('transactions.created_at', start)
        .lt('transactions.created_at', end)
        .order('id')
        .range(from, to) as never
    )

    const map = new Map<string, DetailRow>()
    for (const it of items) {
      const name = it.products?.name ?? 'สินค้าที่ถูกลบแล้ว'
      const key = `${name}|${it.vat_applicable}`
      const row = map.get(key) ?? { name, vat: it.vat_applicable, qty: 0, amount: 0 }
      row.qty += it.quantity
      row.amount += it.subtotal
      map.set(key, row)
    }
    detail = [...map.values()].sort((a, b) => b.amount - a.amount)
  }

  return (
    <VatReportClient
      year={year}
      currentYear={currentYear}
      months={months ?? []}
      store={store}
      loadError={error?.message ?? null}
      month={month}
      detail={detail}
    />
  )
}
