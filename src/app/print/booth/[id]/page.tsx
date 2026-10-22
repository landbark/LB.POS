import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import BoothSheetView, { type BoothSheetLine } from './BoothSheetView'

export default async function BoothSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: trip }, { data: store }, { data: items }, soldRows] = await Promise.all([
    supabase.from('booth_trips').select('*').eq('id', id).maybeSingle(),
    supabase.from('store_settings').select('*').limit(1).single(),
    supabase
      .from('booth_trip_items')
      .select('product_id, taken_quantity, returned_quantity, products(name, sku, unit)')
      .eq('trip_id', id)
      .order('created_at'),
    fetchAll<{ product_id: string | null; base_quantity: number }>((from, to) =>
      supabase
        .from('transaction_items')
        .select('product_id, base_quantity, transactions!inner(booth_trip_id, status)')
        .eq('transactions.booth_trip_id', id)
        .eq('transactions.status', 'completed')
        .order('id')
        .range(from, to),
    ),
  ])

  if (!trip) notFound()

  const soldByProduct = new Map<string, number>()
  for (const row of soldRows) {
    if (!row.product_id) continue
    soldByProduct.set(row.product_id, (soldByProduct.get(row.product_id) ?? 0) + row.base_quantity)
  }

  const lines: BoothSheetLine[] = (items ?? []).map((it) => {
    const product = it.products as unknown as { name: string; sku: string | null; unit: string } | null
    return {
      name: product?.name ?? '—',
      sku: product?.sku ?? null,
      unit: product?.unit ?? '',
      taken: it.taken_quantity,
      returned: it.returned_quantity,
      sold: soldByProduct.get(it.product_id) ?? 0,
    }
  })

  return <BoothSheetView trip={trip as never} store={store} lines={lines} />
}
