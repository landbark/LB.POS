import { createClient } from '@/lib/supabase/server'
import AppointmentsClient from './AppointmentsClient'

export default async function AppointmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: appointments }, { data: pets }] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, pets(id, name, species), customers(id, name, phone), vet:profiles!appointments_vet_id_fkey(name)')
      .order('scheduled_at')
      .limit(500),
    // รายชื่อตั้งต้นของช่องเลือกสัตว์ — พิมพ์ค้นแล้วค่อยยิงไปค้นที่ server
    // (เดิมดึงสัตว์ทั้งตาราง พอเกิน 1000 แถวจะหายจากช่องเลือกโดยไม่มีสัญญาณ)
    supabase.from('pets').select('*, customers(id, name, phone)').eq('active', true)
      .order('created_at', { ascending: false }).limit(12),
  ])

  return <AppointmentsClient appointments={appointments ?? []} recentPets={pets ?? []} userId={user?.id ?? ''} />
}
