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

/** แยกกุญแจของคุกกี้ออกจากกุญแจอื่น เผื่อวันหนึ่งต้องหมุนอย่างใดอย่างหนึ่ง */
const SESSION_KEY_CONTEXT = 'landbark-customer-session-v1'

function secretKey() {
  const explicit = process.env.CUSTOMER_SESSION_SECRET
  if (explicit) return new TextEncoder().encode(explicit)

  // ไม่ได้ตั้งไว้ → ใช้ service role key เป็นวัตถุดิบ แต่ไม่เอามาใช้ตรง ๆ
  // เติม context นำหน้าให้เป็นกุญแจคนละดอก จะได้ไม่ใช้กุญแจเดียวสองหน้าที่
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!fallback) throw new Error('missing CUSTOMER_SESSION_SECRET')
  return new TextEncoder().encode(`${SESSION_KEY_CONTEXT}:${fallback}`)
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

/**
 * คุกกี้ผูกไว้กับ "บัญชี LINE" ด้วย ไม่ใช่แค่ id ลูกค้า
 *
 * ถ้าเก็บแค่ id ลูกค้า คุกกี้จะอยู่ยาวกว่าการเชื่อมต่อที่มันอ้างถึง — ร้านปลด
 * การเชื่อมต่อ (หรือปฏิเสธคำขอผูก) แล้วเจ้าตัวมาผูกใหม่ คุกกี้ใบเดิมของคนก่อน
 * จะกลับมาใช้ได้อีกและกลายเป็นเซสชันที่ยืนยันแล้ว เก็บ LINE id ไว้ด้วยจึงเทียบได้
 * ว่าคนถือคุกกี้ยังเป็น LINE ที่ผูกอยู่จริง
 */
export const createSessionValue = (customerId: string, lineUserId: string) =>
  signValue(`${customerId}|${lineUserId}`, SESSION_MAX_AGE)
export const createPendingValue = (data: string) => signValue(data, PENDING_MAX_AGE)

/** id ลูกค้าจากคุกกี้ (ตรวจลายเซ็น + วันหมดอายุ) — ยังไม่เทียบกับ LINE ที่ผูกอยู่ */
export async function getCustomerId(): Promise<string | null> {
  const raw = await readSignedValue((await cookies()).get(CUSTOMER_COOKIE)?.value)
  return raw ? raw.split('|')[0] : null
}

export interface CustomerSession {
  id: string
  /** ร้านยืนยันแล้วว่าเป็นเจ้าของบัญชีจริง — false = เห็นแต้ม/ประวัติ/ที่อยู่ไม่ได้ */
  verified: boolean
  /** LINE นี้มาจับจองบัญชีเมื่อไหร่ — ออเดอร์ก่อนเวลานี้ไม่ใช่ของคนที่ถืออยู่ */
  claimedAt: string | null
}

/**
 * เซสชันลูกค้าที่ใช้ได้จริง — ตรวจว่า LINE ในคุกกี้ยังเป็นตัวที่ผูกกับบัญชีนี้อยู่
 *
 * คุกกี้รุ่นเก่า (เก็บแค่ id ลูกค้า) ใช้ต่อไม่ได้ ต้องกดเข้าสู่ระบบด้วย LINE อีกครั้ง
 * — แลกกับการที่เซสชันเก่าค้างอยู่เหนือการเชื่อมต่อที่เปลี่ยนไปแล้ว
 */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  const raw = await readSignedValue((await cookies()).get(CUSTOMER_COOKIE)?.value)
  if (!raw) return null

  const [id, lineUserId] = raw.split('|')
  if (!id || !lineUserId) return null

  const admin = createAdminClient()
  // select('*') กันพังช่วงก่อนรัน migration (คอลัมน์ line_verified_at อาจยังไม่มี)
  const { data } = await admin.from('customers').select('*').eq('id', id).maybeSingle()
  const row = data as Record<string, unknown> | null
  if (!row || row.line_user_id !== lineUserId) return null

  return {
    id,
    verified: Boolean(row.line_verified_at),
    claimedAt: (row.line_claimed_at as string | null) ?? null,
  }
}

/** id ลูกค้าเฉพาะเซสชันที่ร้านยืนยันแล้ว — null = ยังไม่ล็อกอิน หรือยังรอยืนยัน */
export async function getVerifiedCustomerId(): Promise<string | null> {
  const session = await getCustomerSession()
  return session?.verified ? session.id : null
}

/**
 * ออเดอร์ที่เซสชันนี้มีสิทธิ์เห็น — คืนเวลาเริ่มต้น (null = เห็นได้ทั้งหมด)
 *
 * เซสชันที่ยังไม่ยืนยันเห็นเฉพาะใบที่สั่งเองหลังจับจองบัญชี ไม่ใช่ของเจ้าของเดิม
 */
export function orderCutoff(session: Pick<CustomerSession, 'verified' | 'claimedAt'>): string | null {
  return session.verified ? null : (session.claimedAt ?? new Date().toISOString())
}

export interface SessionCustomer {
  id: string
  name: string
  phone: string
  points: number
  credit_balance: number
  total_spent: number
  line_user_id: string | null
  verified: boolean
  claimedAt: string | null
}

/** ข้อมูลลูกค้าที่ล็อกอินอยู่ (อ่านด้วย service role — หน้าเว็บลูกค้าไม่มี session Supabase) */
export async function getSessionCustomer(): Promise<SessionCustomer | null> {
  const session = await getCustomerSession()
  if (!session) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('customers')
    .select('id, name, phone, points, credit_balance, total_spent, line_user_id')
    .eq('id', session.id)
    .maybeSingle()

  if (!data) return null
  return { ...(data as Omit<SessionCustomer, 'verified' | 'claimedAt'>), verified: session.verified, claimedAt: session.claimedAt }
}
