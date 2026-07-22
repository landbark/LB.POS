import { createClient } from '@/lib/supabase/server'
import CustomersClient from './CustomersClient'

export default async function CustomersPage() {
  const supabase = await createClient()

  const [{ data: customers }, { data: pets }] = await Promise.all([
    supabase.from('customers').select('*').order('created_at', { ascending: false }),
    supabase.from('pets').select('id, name, customer_id').eq('active', true).order('name'),
  ])

  // ชื่อสัตว์เลี้ยงต่อลูกค้า — ใช้แค่แสดงในตาราง ไม่ต้องดึงข้อมูลสัตว์ทั้งก้อน
  const petNames: Record<string, string[]> = {}
  for (const pet of pets ?? []) {
    ;(petNames[pet.customer_id] ??= []).push(pet.name)
  }

  return <CustomersClient customers={customers ?? []} petNames={petNames} />
}
