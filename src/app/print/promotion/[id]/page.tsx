import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PROMOTION_SELECT, toPromotion } from '@/lib/promotions'
import PromotionPrintView from './PromotionPrintView'

export default async function PromotionPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: row }, { data: store }] = await Promise.all([
    supabase.from('promotions').select(PROMOTION_SELECT).eq('id', id).single(),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])

  if (!row) notFound()
  const promotion = toPromotion(row as never)

  // ชื่อสินค้า/หมวดที่โปรนี้คลุม — ดึงแยกเพราะขอบเขตอยู่ในตารางเชื่อม
  const [{ data: products }, { data: categories }] = await Promise.all([
    promotion.product_ids.length > 0
      ? supabase.from('products').select('id, name, unit, price').in('id', promotion.product_ids)
      : Promise.resolve({ data: [] }),
    promotion.category_ids.length > 0
      ? supabase.from('categories').select('id, name').in('id', promotion.category_ids)
      : Promise.resolve({ data: [] }),
  ])

  return (
    <PromotionPrintView
      promotion={promotion}
      products={products ?? []}
      categories={categories ?? []}
      store={store}
    />
  )
}
