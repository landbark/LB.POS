import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import CountClient from './CountClient'

export default async function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: count }, { data: profile }] = await Promise.all([
    supabase.from('stock_counts').select('*, categories(name)').eq('id', id).maybeSingle(),
    user
      ? supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!count) notFound()

  const [{ data: items }, { data: edits }, products] = await Promise.all([
    supabase
      .from('stock_count_items')
      .select('*, counter:profiles!stock_count_items_counted_by_fkey(name)')
      .eq('count_id', id)
      .order('counted_at', { ascending: false }),
    // ประวัติการแก้ + คำขอที่รออนุมัติ อยู่ตารางเดียวกัน
    supabase
      .from('stock_count_edits')
      .select('*, products(name, unit), requester:profiles!stock_count_edits_requested_by_fkey(name), decider:profiles!stock_count_edits_decided_by_fkey(name)')
      .eq('count_id', id)
      .order('requested_at', { ascending: false }),
    // ร้านมีสินค้าเกิน 1000 ตัว — ต้องไล่ทีละหน้า ไม่งั้นตัวท้าย ๆ ยิงบาร์โค้ดแล้วหาไม่เจอ
    fetchAll((from, to) =>
      supabase
        .from('products')
        .select('id, name, sku, barcode, unit, cost, price, category_id, product_lots(id, lot_number, expiry_date, quantity), product_units!product_units_product_id_fkey(id, product_id, unit_name, factor, sku, barcode, price, cost, sellable_pos, sellable_online, purchasable, sort_order, active, created_at)')
        .eq('active', true)
        // ค่าบริการไม่มีของให้นับ
        .eq('is_service', false)
        .order('name')
        .order('id')
        .range(from, to)
    ),
  ])

  return (
    <CountClient
      count={count as never}
      initialItems={(items as never[]) ?? []}
      products={products as never[]}
      edits={(edits as never[]) ?? []}
      userId={user?.id ?? ''}
      role={profile?.role ?? 'cashier'}
    />
  )
}
