import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdmin } from '@/lib/require-staff'
import { exchangeCodeForToken } from '@/lib/shopee'

// Shopee เด้งกลับมาที่นี่หลังร้านกดอนุญาตแอปของเรา (?code=...&shop_id=...)
export async function GET(request: Request) {
  // แอดมินที่ยังใช้งานอยู่เท่านั้น
  if (!(await getAdmin())) return NextResponse.redirect(new URL('/login', request.url))

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const shopId = searchParams.get('shop_id')

  if (!code || !shopId) {
    return NextResponse.redirect(new URL('/admin/settings?shopee=error', request.url))
  }

  const admin = createAdminClient()
  const { data: channel } = await admin
    .from('marketplace_channels')
    .select('id, partner_id, partner_key')
    .eq('platform', 'shopee')
    .maybeSingle()

  if (!channel?.partner_id || !channel?.partner_key) {
    return NextResponse.redirect(new URL('/admin/settings?shopee=missing_credentials', request.url))
  }

  try {
    const token = await exchangeCodeForToken(
      { partnerId: channel.partner_id, partnerKey: channel.partner_key },
      code,
      shopId
    )

    await admin
      .from('marketplace_channels')
      .update({
        shop_id: shopId,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_expires_at: new Date(Date.now() + token.expire_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', channel.id)

    return NextResponse.redirect(new URL('/admin/settings?shopee=connected', request.url))
  } catch (err) {
    return NextResponse.redirect(
      new URL(`/admin/settings?shopee=error&message=${encodeURIComponent((err as Error).message)}`, request.url)
    )
  }
}
