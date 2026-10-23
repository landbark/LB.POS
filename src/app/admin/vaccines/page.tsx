import { createClient } from '@/lib/supabase/server'
import { dueVaccinations, graceDaysFrom, groupDueByPet } from '@/lib/vaccines'
import VaccinesClient from './VaccinesClient'

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

export default async function VaccinesPage() {
  const supabase = await createClient()

  const [{ data: rows }, { data: vaccines }, { data: notifySettings }] = await Promise.all([
    // ดึงทุกเข็มของสัตว์ที่ยัง active — ต้องมีครบเพื่อหาว่าเข็มไหน "ล่าสุด" ต่อ (สัตว์+วัคซีน)
    supabase
      .from('pet_vaccinations')
      .select('pet_id, vaccine_name, dose_date, next_due_date, pets!inner(id, name, species, active, customers(name, phone))')
      .eq('pets.active', true)
      .limit(5000),
    supabase.from('vaccines').select('*').order('species').order('name'),
    // จำนวนวันที่ยอมให้เลยกำหนดก่อนเลิกเตือน — ตั้งไว้ที่หน้าแจ้งเตือน
    supabase.from('notify_settings').select('*').eq('id', 1).maybeSingle(),
  ])

  type Row = {
    pet_id: string
    vaccine_name: string
    dose_date: string
    next_due_date: string | null
    pets: { id: string; name: string; species: string; customers: { name: string; phone: string } | null } | null
  }

  // ครบกำหนดใน 45 วันข้างหน้า + ที่เลยกำหนดมาไม่นานเกินค่าที่ตั้งไว้ (PostgREST infer relation เป็น array — cast ผ่าน unknown)
  const due = dueVaccinations((rows ?? []) as unknown as Row[], todayISO(), 45, graceDaysFrom(notifySettings))

  // สัตว์ตัวเดียวมักครบหลายเข็มพร้อมกัน — รวมเป็นรายการเดียวแล้วไล่เข็มข้างใน
  const items = groupDueByPet(due).map((g) => {
    const pet = g.doses[0].row.pets
    return {
      petId: pet?.id ?? '',
      petName: pet?.name ?? '—',
      ownerName: pet?.customers?.name ?? null,
      ownerPhone: pet?.customers?.phone ?? null,
      overdue: g.overdue,
      doses: g.doses.map((d) => ({
        vaccineName: d.row.vaccine_name,
        dueDate: d.row.next_due_date,
        overdue: d.overdue,
      })),
    }
  })

  return <VaccinesClient items={items} vaccines={vaccines ?? []} />
}
