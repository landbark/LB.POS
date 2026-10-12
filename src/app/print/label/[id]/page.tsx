import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LabelView from './LabelView'

// ฉลากยาของเวชระเบียนหนึ่งใบ — หนึ่งฉลากต่อยาหนึ่งตัว
export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: visit }, { data: store }] = await Promise.all([
    supabase
      .from('visits')
      .select(`
        id, visit_number, visit_date,
        pets(name, species),
        customers(name, phone),
        vet:profiles!visits_vet_id_fkey(name),
        visit_items(
          id, quantity, dosage, dose_amount, frequency, frequency_hours, food_timing, duration_days,
          products(name, unit, is_service, is_vaccine, categories(is_vaccine))
        )
      `)
      .eq('id', id)
      .single(),
    supabase.from('store_settings').select('name, address, phone, logo_url').limit(1).single(),
  ])

  if (!visit) notFound()

  return <LabelView visit={visit as never} store={store as never} />
}
