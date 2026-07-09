import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PurchasePrintView from './PurchasePrintView'

export default async function PurchasePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: purchase }, { data: store }] = await Promise.all([
    supabase
      .from('purchases')
      .select(`
        id, purchase_number, notes, status, created_at,
        suppliers(name, contact_name, phone),
        purchase_items(quantity, unit_cost, products(name, sku, unit))
      `)
      .eq('id', id)
      .single(),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])

  if (!purchase) notFound()

  return <PurchasePrintView purchase={purchase as never} store={store} />
}
