import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VisitDetail from './VisitDetail'

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: visit } = await supabase
    .from('visits')
    .select(`
      *,
      pets(*, customers(id, name, phone)),
      customers(id, name, phone),
      vet:profiles!visits_vet_id_fkey(name),
      visit_items(*, products(id, name, unit, price, is_vaccine, booster_type, booster_interval_days, categories(is_vaccine)))
    `)
    .eq('id', id)
    .single()

  if (!visit) notFound()

  const [{ data: products }, { data: history }, { data: vaccinations }, { data: vaccines }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, unit, price, is_service, clinic_only, categories(name, clinic_only), product_lots(quantity)')
      .eq('active', true)
      .order('name'),
    // ประวัติการรักษาครั้งก่อนของสัตว์ตัวนี้
    supabase
      .from('visits')
      .select('id, visit_number, visit_date, diagnosis, treatment, weight')
      .eq('pet_id', visit.pet_id)
      .neq('id', id)
      .order('visit_date', { ascending: false })
      .limit(10),
    supabase.from('pet_vaccinations').select('*').eq('pet_id', visit.pet_id).order('dose_date', { ascending: false }),
    supabase.from('vaccines').select('*').order('name'),
  ])

  // น้ำหนักครั้งก่อน — ไว้เทียบว่าขึ้นหรือลง
  const previous = (history ?? []).find((h) => h.weight != null)

  // PostgREST คืน relation แบบ many-to-one เป็น object แต่ type ที่ infer มาเป็น array — cast เหมือนหน้าอื่นในโปรเจกต์
  return (
    <VisitDetail
      visit={visit}
      products={(products ?? []) as never}
      history={history ?? []}
      previousWeight={previous ? { weight: previous.weight, date: previous.visit_date } : null}
      userId={user?.id ?? ''}
      vaccinations={vaccinations ?? []}
      vaccines={vaccines ?? []}
    />
  )
}
