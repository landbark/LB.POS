import { createClient } from '@/lib/supabase/server'
import POSClient from './POSClient'

export default async function POSPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: products }, { data: promotions }, { data: pointsConfig }, { data: storeSettings }] = await Promise.all([
    supabase
      .from('products')
      .select(`
        *,
        categories(name),
        product_lots(id, quantity, expiry_date, lot_number)
      `)
      .eq('active', true)
      .order('name'),
    supabase
      .from('promotions')
      .select('*')
      .eq('active', true)
      .lte('start_date', new Date().toISOString().split('T')[0])
      .gte('end_date', new Date().toISOString().split('T')[0]),
    supabase.from('points_config').select('*').limit(1).single(),
    supabase.from('store_settings').select('promptpay_id').limit(1).single(),
  ])

  return (
    <POSClient
      products={products ?? []}
      promotions={promotions ?? []}
      pointsConfig={pointsConfig}
      cashierId={user?.id ?? ''}
      promptpayId={storeSettings?.promptpay_id ?? null}
    />
  )
}
