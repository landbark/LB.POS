import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VisitPrintView from './VisitPrintView'

export default async function VisitPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: visit }, { data: store }] = await Promise.all([
    supabase
      .from('visits')
      .select(`
        *,
        pets(*),
        customers(name, phone),
        vet:profiles!visits_vet_id_fkey(name),
        visit_items(quantity, unit_price, dosage, products(name, unit))
      `)
      .eq('id', id)
      .single(),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])

  if (!visit) notFound()

  return <VisitPrintView visit={visit as never} store={store} />
}
