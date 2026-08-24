import { NextResponse, type NextRequest } from 'next/server'
import { OAUTH_STATE_COOKIE, createPendingValue, pendingCookieOptions } from '@/lib/customer-session'
import { LINE_AUTHORIZE_URL, callbackUrl, lineChannel, safeNextPath, siteOrigin } from '@/lib/line-login'

// เริ่มล็อกอินลูกค้าด้วย LINE — พาไปหน้า LINE แล้วกลับมาที่ /api/shop/callback
export async function GET(request: NextRequest) {
  const channel = lineChannel()
  const next = safeNextPath(request.nextUrl.searchParams.get('next'))

  if (!channel) {
    return NextResponse.redirect(new URL('/account?error=line-not-configured', siteOrigin(request)))
  }

  const state = crypto.randomUUID()
  const authorize = new URL(LINE_AUTHORIZE_URL)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', channel.id)
  authorize.searchParams.set('redirect_uri', callbackUrl(request))
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('scope', 'profile openid')

  const response = NextResponse.redirect(authorize)
  // เก็บ state + ปลายทางไว้ในคุกกี้ที่เซ็นไว้ กัน CSRF ตอน callback
  response.cookies.set(
    OAUTH_STATE_COOKIE,
    await createPendingValue(`${state}|${next}`),
    pendingCookieOptions
  )
  return response
}
