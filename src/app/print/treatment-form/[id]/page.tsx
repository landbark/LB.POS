import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Pet } from '@/lib/types'
import TreatmentFormView from './TreatmentFormView'

// id = petId — ฟอร์มใบสรุปการรักษาแบบพิมพ์/กรอกเอง (ดึงข้อมูลสัตว์+เจ้าของมาให้)
export default async function TreatmentFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: pet } = await supabase.from('pets').select('*, customers(name, phone)').eq('id', id).single()
  if (!pet) notFound()

  const [{ data: store }, { data: lastWeight }] = await Promise.all([
    supabase.from('store_settings').select('*').limit(1).single(),
    supabase.from('visits').select('weight').eq('pet_id', id).not('weight', 'is', null).order('visit_date', { ascending: false }).limit(1).maybeSingle(),
  ])

  return <TreatmentFormView pet={pet as Pet} store={store} weight={lastWeight?.weight ?? null} />
}
