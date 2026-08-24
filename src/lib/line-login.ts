import type { NextRequest } from 'next/server'

// LINE Login v2.1 (OAuth บนเว็บ) — คนละตัวกับ LIFF ที่หน้า /member ใช้
// ใช้ channel เดิม "LANDBARK Member" ได้ แค่เพิ่ม Callback URL ใน LINE Developers Console

export const LINE_AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize'
export const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token'
export const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'

export function lineChannel() {
  const id = process.env.LINE_LOGIN_CHANNEL_ID
  const secret = process.env.LINE_LOGIN_CHANNEL_SECRET
  return id && secret ? { id, secret } : null
}

/** origin ของเว็บ — ตั้ง NEXT_PUBLIC_SITE_URL ได้ ไม่งั้นใช้ origin ของ request */
export function siteOrigin(request: NextRequest) {
  return (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '')
}

export const callbackUrl = (request: NextRequest) => `${siteOrigin(request)}/api/shop/callback`

/** ที่อยู่ปลายทางหลังล็อกอิน — รับเฉพาะ path ภายในเว็บ กัน open redirect */
export function safeNextPath(value: string | null | undefined) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/account'
}

export interface LineProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

/** แลก code เป็น id_token แล้ว verify กับ LINE (ได้ sub = LINE user id ที่เชื่อถือได้) */
export async function exchangeCodeForProfile(code: string, redirectUri: string): Promise<LineProfile | null> {
  const channel = lineChannel()
  if (!channel) return null

  const tokenRes = await fetch(LINE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: channel.id,
      client_secret: channel.secret,
    }),
  })
  if (!tokenRes.ok) return null

  const token = (await tokenRes.json()) as { id_token?: string }
  if (!token.id_token) return null

  const verifyRes = await fetch(LINE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token.id_token, client_id: channel.id }),
  })
  if (!verifyRes.ok) return null

  const claims = (await verifyRes.json()) as { sub?: string; name?: string; picture?: string }
  if (!claims.sub) return null

  return { userId: claims.sub, displayName: claims.name ?? '', pictureUrl: claims.picture }
}
