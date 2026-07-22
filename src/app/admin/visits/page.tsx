import { createClient } from '@/lib/supabase/server'
import VisitsClient from './VisitsClient'

export default async function VisitsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: visits }, { data: pets }, { data: customers }, { data: profile }, { data: weighed }] = await Promise.all([
    supabase
      .from('visits')
      .select('*, pets(id, name, species, breed), customers(id, name, phone), vet:profiles!visits_vet_id_fkey(name)')
      .order('visit_date', { ascending: false })
      .limit(200),
    supabase
      .from('pets')
      .select('*, customers(id, name, phone)')
      .eq('active', true)
      .order('name'),
    supabase.from('customers').select('id, name, phone').order('name'),
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').single(),
    // น้ำหนักที่ชั่งครั้งล่าสุดของแต่ละตัว — เอาไว้โชว์ตอนลงทะเบียนว่าขึ้น/ลงจากเดิม
    supabase
      .from('visits')
      .select('pet_id, weight, visit_date')
      .not('weight', 'is', null)
      .order('visit_date', { ascending: false })
      .limit(500),
  ])

  const lastWeights: Record<string, { weight: number; date: string }> = {}
  for (const row of weighed ?? []) {
    if (row.pet_id && !lastWeights[row.pet_id]) {
      lastWeights[row.pet_id] = { weight: row.weight, date: row.visit_date }
    }
  }

  return (
    <VisitsClient
      visits={visits ?? []}
      pets={pets ?? []}
      customers={customers ?? []}
      lastWeights={lastWeights}
      userId={user?.id ?? ''}
      role={profile?.role ?? 'cashier'}
    />
  )
}
