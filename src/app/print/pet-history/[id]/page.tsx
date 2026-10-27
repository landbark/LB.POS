import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Pet } from '@/lib/types'
import PetHistoryView from './PetHistoryView'

// id = petId — ประวัติสัตว์ป่วยย่อ พิมพ์ลงสติกเกอร์ขนาดเดียวกับฉลากยา (80 × 50 มม.)
export default async function PetHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: pet } = await supabase.from('pets').select('*, customers(name, phone)').eq('id', id).single()
  if (!pet) notFound()

  const [{ data: store }, { data: visits }, { data: lastVaccine }] = await Promise.all([
    supabase.from('store_settings').select('name, phone').limit(1).single(),
    supabase
      .from('visits')
      .select('id, visit_date, status, diagnosis, treatment, weight')
      .eq('pet_id', id)
      .neq('status', 'cancelled')
      .order('visit_date', { ascending: false })
      .limit(100),
    supabase
      .from('pet_vaccinations')
      .select('vaccine_name, dose_date, next_due_date')
      .eq('pet_id', id)
      .order('dose_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <PetHistoryView
      pet={pet as Pet}
      store={store as never}
      visits={visits ?? []}
      lastVaccine={lastVaccine ?? null}
    />
  )
}
