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
        // ต้องชี้ fkey ให้ชัด — products กับ product_units มีความสัมพันธ์มากกว่าหนึ่งเส้น
        .select('id, name, sku, barcode, categories(name), product_units!product_units_product_id_fkey(sku, barcode)')
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
        sku: p.sku,
        category: (p.categories as unknown as { name: string } | null)?.name ?? null,
        // รวม SKU/บาร์โค้ดของหน่วยย่อยด้วย — ขายยกกล่องมีรหัสของตัวเอง ยิงบาร์โค้ดกล่องต้องเจอ
        codes: [
          p.sku,
          p.barcode,
          ...(p.product_units ?? []).flatMap((u: { sku: string | null; barcode: string | null }) => [u.sku, u.barcode]),
        ]
          .filter(Boolean)
          .join(' '),
      }))}
    />
  )
}
