import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import ReceiveClient from './ReceiveClient'

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: purchase }, products] = await Promise.all([
    supabase
      .from('purchases')
      .select('*, suppliers(name), purchase_items(*, products(name, sku, unit))')
      .eq('id', id)
      .single(),
    // ไว้ให้ช่องเลือกสินค้าของแถวที่เพิ่มตอนรับของ (ของมาเกินใบสั่งซื้อ)
    fetchAll((from, to) =>
      supabase
        .from('products')
        .select('id, name, sku, barcode, unit, cost, supplier_id, product_lots(quantity), product_units!product_units_product_id_fkey(id, product_id, unit_name, factor, sku, barcode, price, cost, sellable_pos, sellable_online, purchasable, sort_order, active, created_at)')
        .eq('active', true)
        .order('name')
        .order('id')
        .range(from, to)
    ),
  ])

  if (!purchase) redirect('/admin/receiving')
  if (purchase.status === 'received') redirect('/admin/receiving')

  return <ReceiveClient purchase={purchase as never} receivedBy={user?.id ?? ''} products={(products as never[]) ?? []} />
}
