import { createClient } from '@/lib/supabase/server'
import VisitsClient from './VisitsClient'

export default async function VisitsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: visits }, { data: recentPets }, { data: profile }, { data: weighed }, { data: breeds }] = await Promise.all([
    supabase
      .from('visits')
      .select('*, pets(id, name, species, breed), customers(id, name, phone), vet:profiles!visits_vet_id_fkey(name)')
      .order('visit_date', { ascending: false })
      .limit(200),
    // รายชื่อตั้งต้นของช่องเลือกสัตว์เท่านั้น — พิมพ์ค้นเมื่อไหร่ค่อยยิงไปค้นที่ server
    // (เดิมดึงสัตว์และลูกค้าทั้งตาราง พอเกิน 1000 แถวจะหายจากช่องเลือกแบบเงียบ ๆ)
    supabase
      .from('pets')
      .select('*, customers(id, name, phone)')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').single(),
    // น้ำหนักที่ชั่งครั้งล่าสุดของแต่ละตัว — เอาไว้โชว์ตอนลงทะเบียนว่าขึ้น/ลงจากเดิม
    supabase
      .from('visits')
      .select('pet_id, weight, visit_date')
      .not('weight', 'is', null)
      .order('visit_date', { ascending: false })
      .limit(500),
    supabase.from('breeds').select('*').order('name'),
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
      recentPets={recentPets ?? []}
      breeds={breeds ?? []}
      lastWeights={lastWeights}
      userId={user?.id ?? ''}
      role={profile?.role ?? 'cashier'}
    />
  )
}
