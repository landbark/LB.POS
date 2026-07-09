import { createClient } from '@/lib/supabase/server'
import ProductForm from '../ProductForm'

export default async function NewProductPage() {
  const supabase = await createClient()
  const [{ data: categories }, { data: units }, { data: suppliers }] = await Promise.all([
    supabase.from('categories').select('*').order('name'),
    supabase.from('units').select('*').order('name'),
    supabase.from('suppliers').select('*').order('name'),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">เพิ่มสินค้า</h1>
      <ProductForm categories={categories ?? []} units={units ?? []} suppliers={suppliers ?? []} />
    </div>
  )
}
