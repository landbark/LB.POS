import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PromotionPrintView from './PromotionPrintView'

export default async function PromotionPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: promotion }, { data: store }] = await Promise.all([
    supabase
      .from('promotions')
      .select(`
        id, name, type, discount_percent, buy_quantity, get_quantity,
        apply_to, start_date, end_date,
        categories(name),
        products(name, unit, price)
      `)
      .eq('id', id)
      .single(),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])

  if (!promotion) notFound()

  return <PromotionPrintView promotion={promotion as never} store={store} />
}
