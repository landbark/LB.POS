import { cookies } from 'next/headers'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// เซสชันลูกค้าหน้าเว็บ (คนละระบบกับ auth ของพนักงาน)
// ค่าในคุกกี้ = "<ข้อมูล base64url>.<หมดอายุ ms>.<ลายเซ็น HMAC>" — HttpOnly, ปลอมไม่ได้ถ้าไม่มี secret
export const CUSTOMER_COOKIE = 'lb_customer'
/** คุกกี้ชั่วคราวระหว่างล็อกอิน LINE สำเร็จ แต่ยังไม่ได้ผูกกับสมาชิกในระบบ */
export const LINE_PENDING_COOKIE = 'lb_line_pending'
export const OAUTH_STATE_COOKIE = 'lb_oauth_state'

const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 วัน
const PENDING_MAX_AGE = 60 * 15 // 15 นาที

function secretKey() {
  // ตั้ง CUSTOMER_SESSION_SECRET เองได้; ไม่ตั้ง = ใช้ service role key (เป็นความลับฝั่ง server อยู่แล้ว)
  const secret = process.env.CUSTOMER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('missing CUSTOMER_SESSION_SECRET')
  return new TextEncoder().encode(secret)
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    secretKey(),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Buffer.from(sig).toString('base64url')
}

export async function signValue(data: string, maxAgeSeconds: number) {
  const payload = `${Buffer.from(data).toString('base64url')}.${Date.now() + maxAgeSeconds * 1000}`
  return `${payload}.${await sign(payload)}`
}

export async function readSignedValue(raw: string | undefined): Promise<string | null> {
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 3) return null
  const [data, expires, signature] = parts

  const expected = await sign(`${data}.${expires}`)
  // เทียบความยาวก่อน กัน timingSafeEqual โยน error เมื่อยาวไม่เท่ากัน
  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  if (!Number(expires) || Number(expires) < Date.now()) return null

  return Buffer.from(data, 'base64url').toString()
}

const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

export const sessionCookieOptions = { ...baseCookieOptions, maxAge: SESSION_MAX_AGE }
export const pendingCookieOptions = { ...baseCookieOptions, maxAge: PENDING_MAX_AGE }

export const createSessionValue = (customerId: string) => signValue(customerId, SESSION_MAX_AGE)
export const createPendingValue = (data: string) => signValue(data, PENDING_MAX_AGE)

/** id ลูกค้าจากคุกกี้ (ตรวจลายเซ็น + วันหมดอายุ) — null = ยังไม่ล็อกอิน */
export async function getCustomerId(): Promise<string | null> {
  return readSignedValue((await cookies()).get(CUSTOMER_COOKIE)?.value)
}

export interface SessionCustomer {
  id: string
  name: string
  phone: string
  points: number
  credit_balance: number
  total_spent: number
  line_user_id: string | null
}

/** ข้อมูลลูกค้าที่ล็อกอินอยู่ (อ่านด้วย service role — หน้าเว็บลูกค้าไม่มี session Supabase) */
export async function getSessionCustomer(): Promise<SessionCustomer | null> {
  const id = await getCustomerId()
  if (!id) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('customers')
    .select('id, name, phone, points, credit_balance, total_spent, line_user_id')
    .eq('id', id)
    .maybeSingle()

  return (data as SessionCustomer) ?? null
}
