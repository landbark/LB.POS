import { NextResponse, type NextRequest } from 'next/server'
import {
  CUSTOMER_COOKIE,
  LINE_PENDING_COOKIE,
  createSessionValue,
  readSignedValue,
  sessionCookieOptions,
} from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { notifyEvent } from '@/lib/notify'
import { pushAppNotification } from '@/lib/appNotify'

/**
 * ผูกบัญชี LINE ที่เพิ่งล็อกอิน เข้ากับสมาชิกของร้าน หรือสมัครสมาชิกใหม่
 *
 * เบอร์โทรพิสูจน์ความเป็นเจ้าของไม่ได้ (ใครรู้เบอร์ก็กรอกได้ และเบอร์มือถือไล่เดาได้)
 * จึงแยก "ผูก" ออกจาก "ยืนยัน":
 *
 *   เบอร์ยังไม่มีในระบบ → สมัครใหม่ ยืนยันให้เลย (ไม่มีของใครให้ยึด)
 *   เบอร์มีในระบบแล้ว   → จับจองไว้ก่อน เข้าใช้/สั่งของได้ทันที แต่ยังไม่เห็น
 *                         แต้ม/เครดิต/ยอดซื้อสะสม/ประวัติ/ที่อยู่/QR บัตรสมาชิก
 *                         จนพนักงานกดยืนยันที่หน้า ลูกค้า (/admin/customers)
 *
 * การจับจองที่ยังไม่ยืนยัน "ทับกันได้" — ไม่งั้นคนแปลกหน้าไล่ยิงเบอร์จับจอง
 * บัญชีลูกค้าทิ้งไว้ แล้วเจ้าตัวจะผูกเบอร์ของตัวเองไม่ได้เลย ส่วนที่ยืนยันแล้วทับไม่ได้
 */
export async function POST(request: NextRequest) {
  const pending = await readSignedValue(request.cookies.get(LINE_PENDING_COOKIE)?.value)
  if (!pending) {
    return NextResponse.json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง' }, { status: 401 })
  }
  const [lineUserId, displayName] = pending.split('|')

  // กันไล่เดาเบอร์ — ต่อ ip และต่อบัญชี LINE (ไล่ยิงต้องสมัคร LINE ใหม่ทุกครั้ง)
  for (const key of [`shop-link-ip:${clientIp(request)}`, `shop-link-line:${lineUserId}`]) {
    const limited = await rateLimit(key, { limit: 5, windowMs: 10 * 60_000 })
    if (!limited.ok) {
      return NextResponse.json(
        { error: 'ลองหลายครั้งเกินไป กรุณารอสักครู่' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
      )
    }
  }

  const body = await request.json().catch(() => ({}))
  const phone = String(body.phone ?? '').trim()
  const name = String(body.name ?? '').trim() || displayName || 'สมาชิก'

  if (!/^[0-9]{9,10}$/.test(phone.replace(/[-\s]/g, ''))) {
    return NextResponse.json({ error: 'กรุณากรอกเบอร์โทรให้ถูกต้อง' }, { status: 400 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const session = async (customerId: string, extra: Record<string, unknown>) => {
    const response = NextResponse.json({ ok: true, ...extra })
    response.cookies.delete(LINE_PENDING_COOKIE)
    response.cookies.set(CUSTOMER_COOKIE, await createSessionValue(customerId, lineUserId), sessionCookieOptions)
    return response
  }

  // LINE นี้ผูกกับสมาชิกคนไหนอยู่แล้วหรือยัง — หนึ่งบัญชี LINE จับจองได้ทีละรายเท่านั้น
  // (ไล่ยึดหลายเบอร์ด้วย LINE เดียวจึงทำไม่ได้)
  const { data: linkedToMe } = await admin
    .from('customers')
    .select('id, phone, line_verified_at')
    .eq('line_user_id', lineUserId)
    .maybeSingle()

  if (linkedToMe) {
    if (linkedToMe.phone === phone) {
      return session(linkedToMe.id, { pending: !linkedToMe.line_verified_at })
    }
    return NextResponse.json(
      { error: 'บัญชี LINE นี้ผูกกับสมาชิกอื่นอยู่แล้ว — ติดต่อร้านเพื่อแก้ไข' },
      { status: 409 }
    )
  }

  const { data: existing } = await admin
    .from('customers')
    .select('id, name, line_user_id, line_verified_at')
    .eq('phone', phone)
    .maybeSingle()

  // ── เบอร์ยังไม่มีในระบบ → สมัครใหม่ ใช้ได้เต็มทันที ──────────────────────────
  if (!existing) {
    const { data: created, error } = await admin
      .from('customers')
      .insert({ name, phone, line_user_id: lineUserId, line_claimed_at: now, line_verified_at: now })
      .select('id')
      .single()
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? 'สมัครสมาชิกไม่สำเร็จ' }, { status: 500 })
    }
    return session(created.id, { isNew: true, pending: false })
  }

  // ── เบอร์มีในระบบและยืนยันไปแล้ว → ทับไม่ได้ ────────────────────────────────
  if (existing.line_verified_at) {
    return NextResponse.json(
      { error: 'เบอร์นี้ผูกกับบัญชี LINE อื่นไปแล้ว — ติดต่อร้านเพื่อแก้ไข' },
      { status: 409 }
    )
  }

  // ── จับจองไว้รอร้านยืนยัน (ทับ claim ที่ยังไม่ยืนยันของคนก่อนได้) ────────────
  const { data: claimed, error: claimError } = await admin
    .from('customers')
    .update({ line_user_id: lineUserId, line_claimed_at: now, line_verified_at: null })
    .eq('id', existing.id)
    .is('line_verified_at', null)   // แข่งกันมา = คนที่ยืนยันไปแล้วชนะ
    .select('id')

  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })
  if ((claimed ?? []).length === 0) {
    return NextResponse.json(
      { error: 'เบอร์นี้ผูกกับบัญชี LINE อื่นไปแล้ว — ติดต่อร้านเพื่อแก้ไข' },
      { status: 409 }
    )
  }

  // คำขอเก่าของบัญชีนี้ที่ยังค้างคิว (ของคนก่อนที่ถูกทับ) ไม่ต้องให้พนักงานเห็นอีก
  await admin
    .from('member_link_requests')
    .update({ status: 'rejected', decided_at: now })
    .eq('customer_id', existing.id)
    .eq('status', 'pending')

  const { data: req } = await admin
    .from('member_link_requests')
    .insert({ line_user_id: lineUserId, phone, customer_id: existing.id })
    .select('id')
    .maybeSingle()

  // บอกร้านให้รู้ — ลูกค้ามักยืนรออยู่หน้าร้าน แต่ถ้าขอมาตอนกลางคืนก็ต้องมีคนเห็น
  await pushAppNotification(admin, {
    kind: 'member_link',
    title: `ขอผูกบัญชีสมาชิก ${existing.name}`,
    body: `เบอร์ ${phone} — ยืนยันเฉพาะเมื่อแน่ใจว่าเป็นเจ้าของเบอร์นี้จริง (ถามลูกค้าที่อยู่ตรงหน้า หรือโทรกลับตามเบอร์ในระบบ)`,
    link: '/admin/customers',
  })
  await notifyEvent(
    'member_link',
    `🔗 มีคนขอผูก LINE กับสมาชิก "${existing.name}" (${phone})\n\n`
      + 'ยืนยันที่หน้า ลูกค้า → คำขอผูกบัญชี\n'
      + 'ยืนยันเฉพาะเมื่อแน่ใจว่าเป็นเจ้าของเบอร์จริง — ผู้ที่ผูกแล้วจะเห็นแต้มและประวัติการซื้อทั้งหมด',
    { dedupeKey: req?.id ? `member-link:${req.id}` : undefined }
  )

  return session(existing.id, { pending: true })
}
