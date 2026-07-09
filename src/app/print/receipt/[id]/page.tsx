import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ReceiptView from './ReceiptView'

export default async function ReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: tx }, { data: store }] = await Promise.all([
    supabase
      .from('transactions')
      .select(`
        id, transaction_number, created_at, subtotal, discount, total,
        payment_method, cash_received, change_given, points_earned, points_used,
        customers(name, phone),
        profiles(name),
        transaction_items(quantity, unit_price, discount, subtotal, products(name, unit))
      `)
      .eq('id', id)
      .single(),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])

  if (!tx) notFound()

  return <ReceiptView tx={tx as never} store={store} />
}
