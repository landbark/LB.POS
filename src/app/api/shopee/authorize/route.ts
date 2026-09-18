import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdmin } from '@/lib/require-staff'
import { buildAuthorizeUrl } from '@/lib/shopee'

// เริ่มขั้นตอนเชื่อมต่อร้าน Shopee — พาไปหน้ายืนยันของ Shopee (admin กดจากหน้าตั้งค่า)
export async function GET(request: Request) {
  // แอดมินที่ยังใช้งานอยู่เท่านั้น
  if (!(await getAdmin())) return NextResponse.redirect(new URL('/login', request.url))

  const admin = createAdminClient()
  const { data: channel } = await admin
    .from('marketplace_channels')
    .select('partner_id, partner_key')
    .eq('platform', 'shopee')
    .maybeSingle()

  if (!channel?.partner_id || !channel?.partner_key) {
    return NextResponse.redirect(new URL('/admin/settings?shopee=missing_credentials', request.url))
  }

  const redirectUri = new URL('/api/shopee/callback', request.url).toString()
  const authorizeUrl = buildAuthorizeUrl(
    { partnerId: channel.partner_id, partnerKey: channel.partner_key },
    redirectUri
  )

  return NextResponse.redirect(authorizeUrl)
}
