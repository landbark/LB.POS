import { NextResponse, type NextRequest } from 'next/server'
import { CUSTOMER_COOKIE, LINE_PENDING_COOKIE } from '@/lib/customer-session'
import { siteOrigin } from '@/lib/line-login'

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', siteOrigin(request)), { status: 303 })
  response.cookies.delete(CUSTOMER_COOKIE)
  response.cookies.delete(LINE_PENDING_COOKIE)
  return response
}
