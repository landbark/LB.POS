import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerDetail from './CustomerDetail'

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: customer } = await supabase.from('customers').select('*').eq('id', id).single()
  if (!customer) notFound()

  const [{ data: pets }, { data: breeds }, { data: transactions }, { data: visits }] = await Promise.all([
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
      .select('id, visit_number, visit_date, status, diagnosis, pets(name)')
      .eq('customer_id', id)
      .order('visit_date', { ascending: false })
      .limit(20),
  ])

  return (
    <CustomerDetail
      customer={customer}
      pets={pets ?? []}
      breeds={breeds ?? []}
      transactions={transactions ?? []}
      visits={(visits as never[]) ?? []}
    />
  )
}
