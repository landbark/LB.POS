import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Pet } from '@/lib/types'
import PetLabelView from './PetLabelView'

// id = petId — ฉลากแปะแฟ้ม/กรง ข้อมูลสัตว์กับเจ้าของ ขนาดเดียวกับฉลากยา (80 × 50 มม.)
export default async function PetLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: pet } = await supabase.from('pets').select('*, customers(name, phone)').eq('id', id).single()
  if (!pet) notFound()

  const [{ data: store }, { data: lastWeight }] = await Promise.all([
    supabase.from('store_settings').select('name, phone').limit(1).single(),
    supabase
      .from('visits')
      .select('weight')
      .eq('pet_id', id)
      .not('weight', 'is', null)
      .order('visit_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return <PetLabelView pet={pet as Pet} store={store as never} weight={lastWeight?.weight ?? null} />
}
