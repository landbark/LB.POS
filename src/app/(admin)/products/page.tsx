import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Edit } from 'lucide-react'
import DeleteProductButton from './DeleteProductButton'

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select(`
      *,
      categories(name),
      product_lots(quantity)
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
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">บาร์โค้ด</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">หมวด</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ราคา</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">คงเหลือ</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products?.map((product) => {
              const totalStock = product.product_lots?.reduce(
                (sum: number, lot: any) => sum + (lot.quantity ?? 0),
                0
              ) ?? 0
              const lowStock = totalStock <= product.min_stock

              return (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{product.name}</p>
                    <p className="text-xs text-gray-500">{product.unit}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {product.barcode || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {(product.categories as any)?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                    ฿{product.price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={lowStock ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                      {totalStock} {product.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                      product.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {product.active ? 'ใช้งาน' : 'ปิด'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                      >
                        <Edit size={15} />
                      </Link>
                      <DeleteProductButton id={product.id} name={product.name} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {(!products || products.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
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
