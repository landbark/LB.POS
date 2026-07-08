import { createClient } from '@/lib/supabase/server'
import ProductForm from '../ProductForm'

export default async function NewProductPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase.from('categories').select('*').order('name')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">เพิ่มสินค้า</h1>
      <ProductForm categories={categories ?? []} />
    </div>
  )
}
