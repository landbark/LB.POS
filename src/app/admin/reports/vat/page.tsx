import { createClient } from '@/lib/supabase/server'
import VatReportClient from './VatReportClient'

// ปีตามเวลาไทย (server อยู่ UTC)
function thaiYearNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getFullYear()
}

export default async function VatReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const { year: yearParam } = await searchParams
  const currentYear = thaiYearNow()
  const year = Number(yearParam) || currentYear

  const supabase = await createClient()
  const [{ data: months, error }, { data: store }] = await Promise.all([
    supabase.rpc('vat_sales_by_month', { p_year: year }),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])

  return (
    <VatReportClient
      year={year}
      currentYear={currentYear}
      months={months ?? []}
      store={store}
      loadError={error?.message ?? null}
    />
  )
}
