import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import ProductRow from './ProductRow'

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select(`
      *,
      categories(name),
      product_lots(id, lot_number, expiry_date, quantity)
    `)
    .order('name')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">สินค้า</h1>
        <Link
          href="/admin/products/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          เพิ่มสินค้า
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สินค้า</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">SKU</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">บาร์โค้ด</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">หมวด</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ราคา</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">คงเหลือ</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products?.map((product) => (
              <ProductRow key={product.id} product={product as never} />
            ))}
            {(!products || products.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  ยังไม่มีสินค้า — กด &quot;เพิ่มสินค้า&quot; เพื่อเริ่มต้น
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
