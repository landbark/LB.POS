import { createClient } from '@/lib/supabase/server'
import PromotionsClient from './PromotionsClient'

export default async function PromotionsPage() {
  const supabase = await createClient()

  const [{ data: promotions }, { data: categories }, { data: products }] = await Promise.all([
    supabase.from('promotions').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('name'),
    supabase.from('products').select('id, name').eq('active', true).order('name'),
  ])

  return (
    <PromotionsClient
      promotions={promotions ?? []}
      categories={categories ?? []}
      products={(products as { id: string; name: string }[]) ?? []}
    />
  )
}
