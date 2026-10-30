import { createClient } from '@/lib/supabase/server'
import { isVet } from '@/lib/roles'
import DocumentsClient from './DocumentsClient'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // สัตวแพทย์พิเศษเปิดหน้านี้ได้แต่ดูอย่างเดียว — RLS ก็กันการเขียน transactions ไว้อีกชั้น
  const [{ data: profile }, { data: receipts }, { data: purchaseOrders }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle(),
    supabase
      .from('transactions')
      .select('id, transaction_number, created_at, recorded_at, backdate_reason, total, status, customer_id, payment_method, payment_method_original, sales_channel, external_order_no, profiles!transactions_cashier_id_fkey(name), transaction_payments(method, amount)')
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
      canEdit={!isVet(profile?.role)}
    />
  )
}
