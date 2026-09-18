import { createAdminClient } from '@/lib/supabase/admin'
import type { MarketplaceChannel } from '@/lib/types'

// อ่านรายชื่อ channel แบบไม่มีความลับ (ไม่มี partner_key/token) — ใช้ฝั่ง server component เท่านั้น
// marketplace_channels ไม่มี RLS policy ให้ authenticated เลย ต้องผ่าน service role เสมอ
export async function getMarketplaceChannels(): Promise<MarketplaceChannel[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('marketplace_channels')
    .select('id, platform, shop_id, shop_name, active, access_token, updated_at')
    .order('platform')

  return (data ?? []).map((c) => ({
    id: c.id,
    platform: c.platform,
    shop_id: c.shop_id,
    shop_name: c.shop_name,
    active: c.active,
    connected: !!c.access_token,
    updated_at: c.updated_at,
  }))
}
