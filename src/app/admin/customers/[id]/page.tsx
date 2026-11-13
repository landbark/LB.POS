import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/require-staff'
import CustomerDetail from './CustomerDetail'

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const isAdmin = !!(await getAdmin())

  const { data: customer } = await supabase.from('customers').select('*').eq('id', id).single()
  if (!customer) notFound()

  const [{ data: pets }, { data: breeds }, { data: transactions }, { data: visits }, { data: pointLots }] = await Promise.all([
    supabase.from('pets').select('*, customers(id, name, phone)').eq('customer_id', id).eq('active', true).order('name'),
    supabase.from('breeds').select('*').order('name'),
    supabase
      .from('transactions')
      .select('id, transaction_number, created_at, total, status')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('visits')
      .select('id, visit_number, visit_date, status, diagnosis, healthy, pets(name), visit_diagnoses(diagnoses(*))')
      .eq('customer_id', id)
      .order('visit_date', { ascending: false })
      .limit(20),
    // ก้อนแต้มที่ยังใช้ได้ — ไว้ตอบลูกค้าว่าแต้มชุดไหนหมดเมื่อไหร่
    supabase
      .from('point_lots')
      .select('id, points, used, earned_at, expires_at, note')
      .eq('customer_id', id)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at')
      .limit(50),
  ])

  return (
    <CustomerDetail
      customer={customer}
      pets={pets ?? []}
      breeds={breeds ?? []}
      transactions={transactions ?? []}
      visits={(visits as never[]) ?? []}
      pointLots={pointLots ?? []}
      isAdmin={isAdmin}
    />
  )
}
