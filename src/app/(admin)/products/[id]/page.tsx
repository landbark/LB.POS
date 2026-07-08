import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ProductForm from '../ProductForm'
import LotManager from './LotManager'

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('*, product_lots(*)')
      .eq('id', id)
      .single(),
    supabase.from('categories').select('*').order('name'),
  ])

  if (!product) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">แก้ไขสินค้า</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProductForm categories={categories ?? []} product={product} />
        <LotManager productId={id} lots={product.product_lots ?? []} unit={product.unit} />
      </div>
    </div>
  )
}
