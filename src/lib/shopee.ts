import { createHmac } from 'crypto'

// Shopee Open Platform v2 API client — เอกสาร: https://open.shopee.com/documents
// ยังไม่ได้ทดสอบกับร้านจริง (รอ Partner ID/Key) — ตรวจสอบ signing/response shape อีกครั้งตอนเชื่อมต่อจริงครั้งแรก
const SHOPEE_HOST = 'https://partner.shopeemobile.com'

function sign(partnerKey: string, baseString: string) {
  return createHmac('sha256', partnerKey).update(baseString).digest('hex')
}

function now() {
  return Math.floor(Date.now() / 1000)
}

// เซ็นชื่อ request ระดับ "public" (ไม่ต้องมี shop access_token) — ใช้กับ authorize link และ token exchange
function signPublic(partnerId: string, partnerKey: string, path: string, timestamp: number) {
  return sign(partnerKey, `${partnerId}${path}${timestamp}`)
}

// เซ็นชื่อ request ระดับ "shop" (ต้องมี access_token + shop_id) — ใช้กับ API ที่ทำงานกับข้อมูลร้าน เช่น อัปเดตสต็อค
function signShop(partnerId: string, partnerKey: string, path: string, timestamp: number, accessToken: string, shopId: string) {
  return sign(partnerKey, `${partnerId}${path}${timestamp}${accessToken}${shopId}`)
}

interface ShopeeCreds {
  partnerId: string
  partnerKey: string
}

// สร้างลิงก์ให้ร้านกดอนุญาต (authorize) แอปของเราเข้าถึงร้าน Shopee ของเขาเอง
export function buildAuthorizeUrl({ partnerId, partnerKey }: ShopeeCreds, redirectUri: string) {
  const path = '/api/v2/shop/auth_partner'
  const timestamp = now()
  const signature = signPublic(partnerId, partnerKey, path, timestamp)
  const url = new URL(SHOPEE_HOST + path)
  url.searchParams.set('partner_id', partnerId)
  url.searchParams.set('redirect', redirectUri)
  url.searchParams.set('timestamp', String(timestamp))
  url.searchParams.set('sign', signature)
  return url.toString()
}

// แลก code (จาก callback หลังร้านกดอนุญาต) เป็น access_token/refresh_token
export async function exchangeCodeForToken(
  { partnerId, partnerKey }: ShopeeCreds,
  code: string,
  shopId: string
) {
  const path = '/api/v2/auth/token/get'
  const timestamp = now()
  const signature = signPublic(partnerId, partnerKey, path, timestamp)
  const url = `${SHOPEE_HOST}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(partnerId) }),
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data.message || data.error || 'แลก token ไม่สำเร็จ')
  }
  return data as {
    access_token: string
    refresh_token: string
    expire_in: number
  }
}

// ต่ออายุ access_token ด้วย refresh_token (access_token ของ Shopee มีอายุสั้น ต้อง refresh เป็นระยะ)
export async function refreshAccessToken(
  { partnerId, partnerKey }: ShopeeCreds,
  refreshToken: string,
  shopId: string
) {
  const path = '/api/v2/auth/access_token/get'
  const timestamp = now()
  const signature = signPublic(partnerId, partnerKey, path, timestamp)
  const url = `${SHOPEE_HOST}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, shop_id: Number(shopId), partner_id: Number(partnerId) }),
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data.message || data.error || 'ต่ออายุ token ไม่สำเร็จ')
  }
  return data as {
    access_token: string
    refresh_token: string
    expire_in: number
  }
}

// เรียก API ระดับร้าน (ต้องมี access_token) — ยังไม่ได้ใช้งานจริงจนกว่าจะเชื่อมต่อร้านสำเร็จ
// ตัวอย่างการใช้ในอนาคต: callShopApi(..., '/api/v2/product/update_stock', 'POST', { item_id, stock_list })
export async function callShopApi(
  { partnerId, partnerKey }: ShopeeCreds,
  { accessToken, shopId, path, method = 'GET', body }: {
    accessToken: string
    shopId: string
    path: string
    method?: 'GET' | 'POST'
    body?: unknown
  }
) {
  const timestamp = now()
  const signature = signShop(partnerId, partnerKey, path, timestamp, accessToken, shopId)
  const url = new URL(SHOPEE_HOST + path)
  url.searchParams.set('partner_id', partnerId)
  url.searchParams.set('timestamp', String(timestamp))
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('shop_id', shopId)
  url.searchParams.set('sign', signature)

  const res = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data.message || data.error || 'เรียก Shopee API ไม่สำเร็จ')
  }
  return data
}
