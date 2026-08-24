import { ExternalLink } from 'lucide-react'
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">เว็บร้าน / ค่าส่ง</h1>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
        >
          ดูเว็บร้านที่ลูกค้าเห็น <ExternalLink size={14} />
        </a>
      </div>
      <div className="space-y-6">
        <WebsiteSection config={storeConfig as StoreSettings | null} />
        <ShippingSection initialZones={(zones ?? []) as ShippingZoneWithRates[]} />
      </div>
    </div>
  )
}
