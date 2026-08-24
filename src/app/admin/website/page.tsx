import { createClient } from '@/lib/supabase/server'
import type { ShippingZoneWithRates, StoreSettings } from '@/lib/types'
import WebsiteSection from '../settings/WebsiteSection'
import ShippingSection from '../settings/ShippingSection'

// แยกจากหน้า "ตั้งค่า" เพราะเป็นเรื่องของเว็บสาธารณะ/ร้านค้าออนไลน์โดยเฉพาะ
export default async function WebsiteSettingsPage() {
  const supabase = await createClient()
  const [{ data: storeConfig }, { data: zones }] = await Promise.all([
    supabase.from('store_settings').select('*').limit(1).single(),
    supabase.from('shipping_zones').select('*, shipping_rates(*)').order('sort_order'),
  ])

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">เว็บร้าน / ค่าส่ง</h1>
      <div className="space-y-6">
        <WebsiteSection config={storeConfig as StoreSettings | null} />
        <ShippingSection initialZones={(zones ?? []) as ShippingZoneWithRates[]} />
      </div>
    </div>
  )
}
