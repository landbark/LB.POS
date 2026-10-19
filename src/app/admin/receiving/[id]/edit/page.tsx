import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { notFound, redirect } from 'next/navigation'
import EditPurchaseClient from './EditPurchaseClient'

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: purchase }, { data: suppliers }, products] = await Promise.all([
    supabase
      .from('purchases')
      .select('id, purchase_number, supplier_id, notes, status, purchase_items(id, product_id, quantity, unit_cost)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('suppliers').select('*').order('name'),
    fetchAll((from, to) =>
      supabase
        .from('products')
        .select('id, name, sku, barcode, unit, cost, supplier_id, product_lots(quantity)')
        .eq('active', true)
        .order('name')
        .order('id')
        .range(from, to)
    ),
  ])

  if (!purchase) notFound()
  // รับของเข้าสต็อคไปแล้วแก้ไม่ได้ — ของเข้าล็อตแล้ว ต้องไปปรับที่สต็อคแทน
  if (purchase.status !== 'pending') redirect('/admin/receiving')

  return (
    <EditPurchaseClient
      purchase={purchase as never}
      suppliers={suppliers ?? []}
      products={(products as never[]) ?? []}
    />
  )
}
