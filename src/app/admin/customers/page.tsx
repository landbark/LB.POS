import { createClient } from '@/lib/supabase/server'
import CustomersClient from './CustomersClient'
import MemberLinkRequests, { type LinkRequest } from './MemberLinkRequests'

/** ลูกค้าโตได้ไม่จำกัด — โหลดทีละหน้าแล้วให้ค้นที่ server ไม่ใช่ดึงทั้งตารางไป filter ในเบราว์เซอร์ */
const PAGE_SIZE = 100

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()
  const term = (q ?? '').trim()

  let query = supabase.from('customers').select('*')
  if (term) {
    // escape % และ _ กันคำค้นของผู้ใช้กลายเป็น wildcard
    const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    query = query.or(`name.ilike.${like},phone.ilike.${like}`)
  }

  const { data: customers } = await query
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  const rows = customers ?? []

  // ชื่อสัตว์เลี้ยงเฉพาะลูกค้าที่แสดงอยู่ ไม่ใช่ทั้งตาราง
  const { data: pets } = rows.length
    ? await supabase
        .from('pets')
        .select('id, name, customer_id')
        .eq('active', true)
        .in('customer_id', rows.map((c) => c.id))
        .order('name')
    : { data: [] }

  const petNames: Record<string, string[]> = {}
  for (const pet of pets ?? []) {
    ;(petNames[pet.customer_id] ??= []).push(pet.name)
  }

  // คำขอผูก LINE ที่รอร้านยืนยัน — พนักงานทุกคนกดได้ ไม่ต้องรอเจ้าของ
  const { data: linkRequests } = await supabase
    .from('member_link_requests')
    .select('id, phone, created_at, customers(name, phone, points)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <>
      <MemberLinkRequests requests={(linkRequests ?? []) as unknown as LinkRequest[]} />
      <CustomersClient
        customers={rows}
        petNames={petNames}
        searching={term.length > 0}
        atLimit={rows.length === PAGE_SIZE}
        pageSize={PAGE_SIZE}
      />
    </>
  )
}
