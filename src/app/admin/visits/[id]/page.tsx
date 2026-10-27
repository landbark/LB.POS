import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import VisitDetail from './VisitDetail'
import { graceDaysFrom } from '@/lib/vaccines'

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
      visit_items(*, products(id, name, unit, price, is_service, is_vaccine, booster_type, booster_interval_days, label_name, label_name_en, indication, indication_en, brand, categories(is_vaccine))),
      visit_diagnoses(id, visit_id, diagnosis_id, created_at, diagnoses(*))
    `)
    .eq('id', id)
    .single()

  if (!visit) notFound()

  const [products, { data: history }, { data: vaccinations }, { data: vaccines }, { data: diagnosisCatalog }, { data: profile }, { data: notifySettings }] = await Promise.all([
    // ไล่ดึงทีละหน้า — supabase ตัดที่ 1000 แถว ยาหลายตัวเรียงตามชื่อแล้วตกขอบหายไปจากช่องสั่งจ่าย
    fetchAll((from, to) =>
      supabase
        .from('products')
        .select('id, name, unit, price, is_service, clinic_only, is_vaccine, booster_type, booster_interval_days, categories(name, clinic_only, is_vaccine), product_lots(quantity)')
        .eq('active', true)
        .order('name')
        .order('id')   // ชื่อสินค้าซ้ำได้ ต้องมีคีย์ไม่ซ้ำปิดท้าย ไม่งั้นแถวซ้ำ/หายระหว่างหน้า
        .range(from, to)
    ),
    // ประวัติการรักษาครั้งก่อนของสัตว์ตัวนี้
    supabase
      .from('visits')
      .select('id, visit_number, visit_date, diagnosis, treatment, weight, visit_diagnoses(diagnoses(*))')
      .eq('pet_id', visit.pet_id)
      .neq('id', id)
      .order('visit_date', { ascending: false })
      .limit(10),
    supabase.from('pet_vaccinations').select('*').eq('pet_id', visit.pet_id).order('dose_date', { ascending: false }),
    supabase.from('vaccines').select('*').order('name'),
    supabase.from('diagnoses').select('*').order('name'),
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').single(),
    // เลยกำหนดเกินกี่วันแล้วเลิกขึ้นแถบเตือนวัคซีน — ตั้งไว้ที่หน้าแจ้งเตือน
    supabase.from('notify_settings').select('*').eq('id', 1).maybeSingle(),
  ])

  // น้ำหนักครั้งก่อน — ไว้เทียบว่าขึ้นหรือลง
  const previous = (history ?? []).find((h) => h.weight != null)

  // PostgREST คืน relation แบบ many-to-one เป็น object แต่ type ที่ infer มาเป็น array — cast เหมือนหน้าอื่นในโปรเจกต์
  return (
    <VisitDetail
      visit={visit}
      products={products as never}
      history={history ?? []}
      previousWeight={previous ? { weight: previous.weight, date: previous.visit_date } : null}
      userId={user?.id ?? ''}
      role={profile?.role ?? 'cashier'}
      vaccinations={vaccinations ?? []}
      vaccines={vaccines ?? []}
      vaccineGraceDays={graceDaysFrom(notifySettings)}
      diagnosisCatalog={diagnosisCatalog ?? []}
    />
  )
}
