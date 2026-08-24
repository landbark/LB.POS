import { NextResponse, type NextRequest } from 'next/server'
import {
  CUSTOMER_COOKIE,
  LINE_PENDING_COOKIE,
  OAUTH_STATE_COOKIE,
  createPendingValue,
  createSessionValue,
  pendingCookieOptions,
  readSignedValue,
  sessionCookieOptions,
} from '@/lib/customer-session'
import { callbackUrl, exchangeCodeForProfile, safeNextPath, siteOrigin } from '@/lib/line-login'
import { createAdminClient } from '@/lib/supabase/admin'

// LINE ส่งลูกค้ากลับมาที่นี่หลังกดอนุญาต
export async function GET(request: NextRequest) {
  const origin = siteOrigin(request)
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')

  const stored = await readSignedValue(request.cookies.get(OAUTH_STATE_COOKIE)?.value)
  const [expectedState, storedNext] = (stored ?? '').split('|')
  const next = safeNextPath(storedNext)

  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/account?error=${reason}`, origin))
    response.cookies.delete(OAUTH_STATE_COOKIE)
    return response
  }

  if (!code || !state || !expectedState || state !== expectedState) return fail('line-state')

  const profile = await exchangeCodeForProfile(code, callbackUrl(request))
  if (!profile) return fail('line-token')

  const admin = createAdminClient()
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('line_user_id', profile.userId)
    .maybeSingle()

  // ยังไม่เคยผูกกับสมาชิกในระบบ → ไปหน้ากรอกเบอร์เพื่อผูก/สมัคร
  if (!customer) {
    const response = NextResponse.redirect(
      new URL(`/account/link?next=${encodeURIComponent(next)}`, origin)
    )
    response.cookies.delete(OAUTH_STATE_COOKIE)
    response.cookies.set(
      LINE_PENDING_COOKIE,
      await createPendingValue(`${profile.userId}|${profile.displayName}`),
      pendingCookieOptions
    )
    return response
  }

  const response = NextResponse.redirect(new URL(next, origin))
  response.cookies.delete(OAUTH_STATE_COOKIE)
  response.cookies.delete(LINE_PENDING_COOKIE)
  response.cookies.set(CUSTOMER_COOKIE, await createSessionValue(customer.id), sessionCookieOptions)
  return response
}
