import { createClient } from '@/lib/supabase/server'
import { dueVaccinations } from '@/lib/vaccines'
import VaccinesClient from './VaccinesClient'

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

export default async function VaccinesPage() {
  const supabase = await createClient()

  const [{ data: rows }, { data: vaccines }] = await Promise.all([
    // ดึงทุกเข็มของสัตว์ที่ยัง active — ต้องมีครบเพื่อหาว่าเข็มไหน "ล่าสุด" ต่อ (สัตว์+วัคซีน)
    supabase
      .from('pet_vaccinations')
      .select('pet_id, vaccine_name, dose_date, next_due_date, pets!inner(id, name, species, active, customers(name, phone))')
      .eq('pets.active', true)
      .limit(5000),
    supabase.from('vaccines').select('*').order('species').order('name'),
  ])

  type Row = {
    pet_id: string
    vaccine_name: string
    dose_date: string
    next_due_date: string | null
    pets: { id: string; name: string; species: string; customers: { name: string; phone: string } | null } | null
  }

  // ครบกำหนด/เกินกำหนด ในกรอบ 45 วัน (PostgREST infer relation เป็น array — cast ผ่าน unknown)
  const due = dueVaccinations((rows ?? []) as unknown as Row[], todayISO(), 45)

  const items = due.map((d) => ({
    petId: d.row.pets?.id ?? '',
    petName: d.row.pets?.name ?? '—',
    ownerName: d.row.pets?.customers?.name ?? null,
    ownerPhone: d.row.pets?.customers?.phone ?? null,
    vaccineName: d.row.vaccine_name,
    dueDate: d.row.next_due_date,
    overdue: d.overdue,
  }))

  return <VaccinesClient items={items} vaccines={vaccines ?? []} />
}
