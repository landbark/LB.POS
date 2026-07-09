import { createClient } from '@/lib/supabase/server'
import PosDisplayClient from './PosDisplayClient'

export default async function PosDisplayPage() {
  const supabase = await createClient()
  const { data: store } = await supabase
    .from('store_settings')
    .select('name, logo_url, payment_qr_url')
    .limit(1)
    .single()

  return (
    <PosDisplayClient
      storeName={store?.name ?? 'LANDBARK'}
      logoUrl={store?.logo_url ?? null}
      paymentQrUrl={store?.payment_qr_url ?? null}
    />
  )
}
