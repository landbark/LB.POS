import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import RewardsClient from './RewardsClient'

export default async function RewardsPage() {
  const supabase = await createClient()

  const [{ data: rewards }, products, { data: pointsConfig }] = await Promise.all([
    supabase
      .from('rewards')
      .select('*, products(id, name, sku, unit, price, product_lots(quantity, expiry_date))')
      .order('sort_order')
      .order('created_at'),
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
    supabase.from('points_config').select('*').limit(1).single(),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ของแลกแต้ม</h1>
      <p className="text-sm text-gray-500 mb-6">
        เลือกสินค้าในระบบมาเปิดให้ลูกค้าแลกด้วยแต้ม — ของแลกใช้สต็อกของสินค้าตัวนั้นเอง
        ตอนปิดบิลระบบตัดล็อตที่ใกล้หมดอายุก่อนให้อัตโนมัติ
      </p>
      <RewardsClient
        rewards={(rewards ?? []) as never}
        products={products}
        pointsConfig={pointsConfig?.enabled === false ? null : pointsConfig}
      />
    </div>
  )
}
