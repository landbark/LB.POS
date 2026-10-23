import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { PROMOTION_SELECT, toPromotion } from '@/lib/promotions'
import PromotionsClient from './PromotionsClient'

export default async function PromotionsPage() {
  const supabase = await createClient()

  const [{ data: promotions }, { data: categories }, products] = await Promise.all([
    supabase.from('promotions').select(PROMOTION_SELECT).order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('name'),
    // ไล่ดึงทีละหน้า — supabase ตัดที่ 1000 แถว ส่วนร้านมีสินค้าเกินนั้นแล้ว
    fetchAll((from, to) =>
      supabase
        .from('products')
        .select('id, name, categories(name)')
        .eq('active', true)
        .order('name')
        .order('id')
        .range(from, to)
    ),
  ])

  return (
    <PromotionsClient
      promotions={(promotions ?? []).map((p) => toPromotion(p as never))}
      categories={categories ?? []}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        category: (p.categories as unknown as { name: string } | null)?.name ?? null,
      }))}
    />
  )
}
