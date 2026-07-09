import { createClient } from '@/lib/supabase/server'
import SuppliersClient from './SuppliersClient'

export default async function SuppliersPage() {
  const supabase = await createClient()
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('*')
    .order('name')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">ซัพพลายเออร์</h1>
      <SuppliersClient suppliers={suppliers ?? []} />
    </div>
  )
}
