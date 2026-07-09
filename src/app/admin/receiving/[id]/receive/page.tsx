import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReceiveClient from './ReceiveClient'

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: purchase } = await supabase
    .from('purchases')
    .select('*, suppliers(name), purchase_items(*, products(name, sku, unit))')
    .eq('id', id)
    .single()

  if (!purchase) redirect('/admin/receiving')
  if (purchase.status === 'received') redirect('/admin/receiving')

  return <ReceiveClient purchase={purchase as never} receivedBy={user?.id ?? ''} />
}
