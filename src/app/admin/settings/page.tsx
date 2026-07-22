import { createClient } from '@/lib/supabase/server'
import { getMarketplaceChannels } from '@/lib/marketplace'
import PasswordSection from './PasswordSection'
import StaffSection from './StaffSection'
import NameListSection from './NameListSection'
import PointsSection from './PointsSection'
import StoreSection from './StoreSection'
import MarketplaceSection from './MarketplaceSection'

export default async function SettingsPage() {
  const supabase = await createClient()

  const [
    { data: staff },
    { data: profiles },
    { data: units },
    { data: categories },
    { data: pointsConfig },
    { data: storeConfig },
    marketplaceChannels,
  ] = await Promise.all([
    supabase.from('staff_emails').select('*').order('created_at'),
    supabase.from('profiles').select('*'),
    supabase.from('units').select('*').order('name'),
    supabase.from('categories').select('*').order('name'),
    supabase.from('points_config').select('*').limit(1).single(),
    supabase.from('store_settings').select('*').limit(1).single(),
    getMarketplaceChannels(),
  ])

  // จับคู่ whitelist กับโปรไฟล์ที่เคยล็อกอิน เพื่อโชว์สถานะ
  const staffWithStatus = (staff ?? []).map((s) => ({
    ...s,
    user_id: profiles?.find((p) => p.email?.toLowerCase() === s.email.toLowerCase())?.id ?? null,
  }))

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">ตั้งค่า</h1>

      <div className="space-y-6">
        <StoreSection config={storeConfig} />

        <StaffSection staff={staffWithStatus} migrated={staff !== null} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <NameListSection
            title="หน่วยสินค้า"
            table="units"
            items={units ?? []}
            placeholder="เช่น กระสอบ"
            deleteHint="สินค้าที่ใช้หน่วยนี้อยู่จะยังแสดงหน่วยเดิม"
          />
          <NameListSection
            title="หมวดหมู่สินค้า"
            table="categories"
            items={categories ?? []}
            placeholder="เช่น อาหารเสริม"
            deleteHint="สินค้าในหมวดนี้จะกลายเป็น ไม่ระบุหมวดหมู่"
            showVat
          />
        </div>

        <PointsSection config={pointsConfig} />

        <MarketplaceSection channels={marketplaceChannels} />

        <PasswordSection />
      </div>
    </div>
  )
}
