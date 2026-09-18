import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdmin } from '@/lib/require-staff'
import type { MarketplacePlatform } from '@/lib/types'

// แอดมินที่ยังใช้งานอยู่เท่านั้น — เก็บ partner key/token ของ marketplace
async function requireAdmin() {
  const admin = await getAdmin()
  if (!admin) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { user: { id: admin.userId } }
}

// บันทึก Partner ID/Key ของแพลตฟอร์ม (admin เท่านั้น) — ตั้งค่าครั้งแรกก่อนกดเชื่อมต่อร้าน
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const body = await request.json()
  const platform = body.platform as MarketplacePlatform
  const partnerId = (body.partner_id ?? '').trim()
  const partnerKey = (body.partner_key ?? '').trim()

  if (!['shopee', 'tiktok', 'lazada'].includes(platform) || !partnerId || !partnerKey) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('marketplace_channels')
    .select('id')
    .eq('platform', platform)
    .maybeSingle()

  // ใส่ partner id/key ใหม่ → รีเซ็ต shop_id/token เดิม (ต้องกดเชื่อมต่อร้านใหม่เสมอเมื่อเปลี่ยน credentials)
  const payload = {
    platform,
    partner_id: partnerId,
    partner_key: partnerKey,
    shop_id: null,
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    updated_at: new Date().toISOString(),
  }

  const { error: saveError } = existing
    ? await admin.from('marketplace_channels').update(payload).eq('id', existing.id)
    : await admin.from('marketplace_channels').insert(payload)

  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
