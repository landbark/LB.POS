import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Pet } from '@/lib/types'
import ReferralView from './ReferralView'

// id = petId
export default async function ReferralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: pet } = await supabase.from('pets').select('*, customers(name, phone)').eq('id', id).single()
  if (!pet) notFound()

  const [{ data: store }, { data: visits }, { data: lastWeight }] = await Promise.all([
    supabase.from('store_settings').select('*').limit(1).single(),
    supabase.from('visits').select('visit_date, diagnosis, treatment').eq('pet_id', id).order('visit_date', { ascending: false }).limit(5),
    supabase.from('visits').select('weight').eq('pet_id', id).not('weight', 'is', null).order('visit_date', { ascending: false }).limit(1).maybeSingle(),
  ])

  return <ReferralView pet={pet as Pet} store={store} visits={visits ?? []} weight={lastWeight?.weight ?? null} />
}
