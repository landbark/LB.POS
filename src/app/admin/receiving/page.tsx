import { createClient } from '@/lib/supabase/server'
import ReceivingClient from './ReceivingClient'

export default async function ReceivingPage() {
  const supabase = await createClient()
  const [{ data: suppliers }, { data: products }, { data: purchases }] = await Promise.all([
    supabase.from('suppliers').select('*').order('name'),
    supabase.from('products').select('id, name, sku, unit, cost, supplier_id').eq('active', true).order('name'),
    supabase
      .from('purchases')
      .select('*, suppliers(name), purchase_items(id)')
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  return (
    <ReceivingClient
      suppliers={suppliers ?? []}
      products={(products as never[]) ?? []}
      purchases={(purchases as never[]) ?? []}
    />
  )
}
