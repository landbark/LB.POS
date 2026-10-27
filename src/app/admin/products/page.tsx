import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import Link from 'next/link'
import { Plus, Boxes } from 'lucide-react'
import ProductsTable from './ProductsTable'
import BulkImportButton from './BulkImportButton'
import ShopeeButton from './ShopeeButton'

// เลือกเฉพาะคอลัมน์ที่ตารางกับปุ่ม Shopee ใช้จริง — `*` ลากคอลัมน์ยาวๆ (คำอธิบายเว็บ, ฉลากยา,
// สรรพคุณ) มาด้วยทั้งที่หน้านี้ไม่ได้แสดง กลายเป็นหลายร้อย KB ที่ต้องส่งไป browser ทุกครั้ง
const COLUMNS = `
  id, name, sku, barcode, search_keywords, price, unit, min_stock, active,
  is_service, on_shopee, online_available, image_url, weight_grams, clinic_only, vat_applicable,
  categories(name, clinic_only, vat_applicable),
  product_lots(id, lot_number, expiry_date, quantity),
  product_units!product_units_product_id_fkey(id, unit_name, factor, price, sellable_pos, active)
`

export default async function ProductsPage() {
  const supabase = await createClient()

  const [{ data: { user } }, products, { data: categories }, { data: units }, { data: suppliers }] = await Promise.all([
    supabase.auth.getUser(),
    // ไล่ดึงทีละหน้า — supabase ตัดที่ 1000 แถว ส่วนร้านมีสินค้าเกินนั้นแล้ว
    fetchAll((from, to) =>
      supabase
        .from('products')
        .select(COLUMNS)
        // ตัวที่ถูกยุบไปเป็นหน่วยของสินค้าอื่นแล้ว ไม่ต้องโผล่ในรายการสินค้า (ดูได้ที่หน้าหน่วยขาย)
        .is('replaced_by_unit_id', null)
        .order('name')
        .order('id')   // ชื่อสินค้าซ้ำได้ ต้องมีคีย์ไม่ซ้ำปิดท้าย ไม่งั้นแถวซ้ำ/หายระหว่างหน้า
        .range(from, to)
    ),
    supabase.from('categories').select('*').order('name'),
    supabase.from('units').select('*').order('name'),
    supabase.from('suppliers').select('id, name').order('name'),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">สินค้า</h1>
        <div className="flex items-center gap-2">
          <ShopeeButton products={products as never} />
          <BulkImportButton
            categories={categories ?? []}
            units={units ?? []}
            suppliers={suppliers ?? []}
            userId={user?.id ?? ''}
          />
          <Link
            href="/admin/products/units"
            className="flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Boxes size={16} />
            หน่วยขาย (กล่อง/ลัง)
          </Link>
          <Link
            href="/admin/products/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            เพิ่มสินค้า
          </Link>
        </div>
      </div>

      <ProductsTable products={(products ?? []) as never} />
    </div>
  )
}
