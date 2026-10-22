import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import ReceivingClient from './ReceivingClient'

export default async function ReceivingPage() {
  const supabase = await createClient()
  const [{ data: suppliers }, products, { data: purchases }] = await Promise.all([
    supabase.from('suppliers').select('*').order('name'),
    // ร้านมีสินค้าเกิน 1000 ตัว — ต้องไล่ทีละหน้า ไม่งั้นตัวท้ายๆ หายจากช่องเลือกแบบเงียบๆ
    fetchAll((from, to) =>
      supabase
        .from('products')
        .select('id, name, sku, barcode, unit, cost, supplier_id, product_lots(quantity), product_units(id, product_id, unit_name, factor, sku, barcode, price, cost, sellable_pos, sellable_online, purchasable, sort_order, active, created_at)')
        .eq('active', true)
        .order('name')
        .order('id')
        .range(from, to)
    ),
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
