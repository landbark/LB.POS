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

    // ของที่รับคืนในเดือนนั้น — หักออกจากยอดรายสินค้า ไม่งั้นของที่ลูกค้าเอามาคืน
    // (หรือเอามาเปลี่ยนเป็นตัวอื่น) ยังค้างเป็นยอดขายอยู่ ทั้งที่ของกลับมาอยู่ที่ร้านแล้ว
    // หักในเดือนที่ออกใบคืน ไม่ย้อนไปแก้เดือนที่ขาย (หลักเดียวกับใบลดหนี้)
    const returned = await fetchAll<{
      quantity: number
      transaction_items: { subtotal: number; quantity: number; vat_applicable: boolean } | null
      products: { name: string } | null
    }>((from, to) =>
      supabase
        .from('return_items')
        .select('quantity, products(name), transaction_items(subtotal, quantity, vat_applicable), returns!inner(created_at)')
        .gte('returns.created_at', start)
        .lt('returns.created_at', end)
        .order('id')
        .range(from, to) as never
    )

    const map = new Map<string, DetailRow>()
    const add = (name: string, vat: boolean, qty: number, amount: number) => {
      const key = `${name}|${vat}`
      const row = map.get(key) ?? { name, vat, qty: 0, amount: 0 }
      row.qty += qty
      row.amount += amount
      map.set(key, row)
    }

    for (const it of items) {
      add(it.products?.name ?? 'สินค้าที่ถูกลบแล้ว', it.vat_applicable, it.quantity, it.subtotal)
    }
    for (const r of returned) {
      const src = r.transaction_items
      if (!src || !src.quantity) continue
      // หักด้วย "ราคาในบิลเดิม" ให้เป็นฐานเดียวกับยอดขายข้างบน (ก่อนหักส่วนลดท้ายบิล)
      add(r.products?.name ?? 'สินค้าที่ถูกลบแล้ว', src.vat_applicable, -r.quantity, -(src.subtotal / src.quantity) * r.quantity)
    }
    // ตัดสินค้าที่ขายแล้วคืนหมดทิ้ง (เหลือ 0 ทั้งจำนวนและยอด) ไม่ต้องขึ้นเป็นแถวเปล่า
    detail = [...map.values()]
      .filter((r) => Math.abs(r.amount) > 0.004 || r.qty !== 0)
      .sort((a, b) => b.amount - a.amount)
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
