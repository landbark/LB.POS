/**
 * ยืนยัน ID token ที่ได้จาก LIFF (liff.getIDToken()) กับเซิร์ฟเวอร์ของ LINE
 *
 * เดิมหน้า /member ส่ง `lineUserId` ที่อ่านจาก liff.getProfile() มาตรง ๆ
 * ซึ่งเป็นแค่ค่าที่ client พิมพ์อะไรมาก็ได้ — ใครรู้ LINE user id ของคนอื่น
 * ก็ยิง API ดูประวัติการซื้อของคนนั้นได้ทันที
 *
 * ID token เป็น JWT ที่ LINE เซ็นไว้ ตรวจกับ LINE แล้วจะได้ `sub` ที่เชื่อถือได้
 */

const LINE_VERIFY_ID_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/verify'

/**
 * channel ที่ออก ID token นี้ — ต้องตรงกับ aud ในตัว token
 *
 * token ออกมาจาก LIFF จึงยึด channel ของ LIFF เป็นหลัก
 * (LIFF id มีรูปแบบ "<channelId>-<suffix>") ส่วน LINE_LOGIN_CHANNEL_ID
 * ใช้เป็นทางสำรอง เพราะอาจเป็นคนละ channel กับ LIFF ได้
 */
function channelId(): string | null {
  return (
    process.env.LINE_LIFF_CHANNEL_ID
    || process.env.NEXT_PUBLIC_LIFF_ID?.split('-')[0]
    || process.env.LINE_LOGIN_CHANNEL_ID
    || null
  )
}

/** คืน LINE user id ที่ยืนยันแล้ว — null = token ไม่ถูกต้อง/หมดอายุ/ผิด channel */
export async function verifyLineIdToken(idToken: unknown): Promise<string | null> {
  if (typeof idToken !== 'string' || idToken.length === 0) return null

  const id = channelId()
  if (!id) return null

  try {
    const res = await fetch(LINE_VERIFY_ID_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: id }),
      cache: 'no-store',
    })
    if (!res.ok) return null

    const data = (await res.json()) as { sub?: string; aud?: string }
    // LINE ตรวจลายเซ็น อายุ และ aud ให้แล้ว เหลือกันเหนียวอีกชั้น
    if (!data.sub || data.aud !== id) return null

    return data.sub
  } catch {
    return null
  }
}
