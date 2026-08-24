import { NextResponse, type NextRequest } from 'next/server'
import {
  CUSTOMER_COOKIE,
  LINE_PENDING_COOKIE,
  createSessionValue,
  readSignedValue,
  sessionCookieOptions,
} from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'

// ผูกบัญชี LINE ที่เพิ่งล็อกอิน เข้ากับสมาชิกในระบบ (ค้นด้วยเบอร์โทร) หรือสมัครสมาชิกใหม่
export async function POST(request: NextRequest) {
  const pending = await readSignedValue(request.cookies.get(LINE_PENDING_COOKIE)?.value)
  if (!pending) {
    return NextResponse.json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง' }, { status: 401 })
  }
  const [lineUserId, displayName] = pending.split('|')

  const body = await request.json()
  const phone = String(body.phone ?? '').trim()
  const name = String(body.name ?? '').trim() || displayName || 'สมาชิก'

  if (!/^[0-9]{9,10}$/.test(phone.replace(/[-\s]/g, ''))) {
    return NextResponse.json({ error: 'กรุณากรอกเบอร์โทรให้ถูกต้อง' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('customers')
    .select('id, name, line_user_id')
    .eq('phone', phone)
    .maybeSingle()

  let customerId: string

  if (existing) {
    if (existing.line_user_id && existing.line_user_id !== lineUserId) {
      return NextResponse.json(
        { error: 'เบอร์นี้ผูกกับบัญชี LINE อื่นไปแล้ว — ติดต่อร้านเพื่อแก้ไข' },
        { status: 409 }
      )
    }
    if (!existing.line_user_id) {
      const { error } = await admin
        .from('customers')
        .update({ line_user_id: lineUserId })
        .eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    customerId = existing.id
  } else {
    const { data: created, error } = await admin
      .from('customers')
      .insert({ name, phone, line_user_id: lineUserId })
      .select('id')
      .single()
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? 'สมัครสมาชิกไม่สำเร็จ' }, { status: 500 })
    }
    customerId = created.id
  }

  const response = NextResponse.json({ ok: true, isNew: !existing })
  response.cookies.delete(LINE_PENDING_COOKIE)
  response.cookies.set(CUSTOMER_COOKIE, await createSessionValue(customerId), sessionCookieOptions)
  return response
}
