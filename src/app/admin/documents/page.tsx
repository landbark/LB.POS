import { createClient } from '@/lib/supabase/server'
import DocumentsClient from './DocumentsClient'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: receipts }, { data: purchaseOrders }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, transaction_number, created_at, total, status, customer_id, profiles(name)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('purchases')
      .select('id, purchase_number, created_at, total_cost, status, suppliers(name)')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  return (
    <DocumentsClient
      receipts={(receipts as never[]) ?? []}
      purchaseOrders={(purchaseOrders as never[]) ?? []}
      currentUserId={user?.id ?? ''}
    />
  )
}
