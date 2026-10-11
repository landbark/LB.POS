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
        .select('id, name, sku, barcode, unit, cost, supplier_id, product_lots(quantity)')
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
