import { NextResponse } from 'next/server'
import { getCustomerId } from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { botUsername, createLinkToken } from '@/lib/customer-notify'

/** ขอลิงก์ผูก Telegram — คืน deep link ที่กดแล้วบอททักกลับมาเอง */
export async function POST() {
  const customerId = await getCustomerId()
  if (!customerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bot = botUsername()
  if (!bot) return NextResponse.json({ error: 'ร้านยังไม่ได้ตั้งค่าบอท' }, { status: 503 })

  const token = await createLinkToken(customerId)
  return NextResponse.json({ url: `https://t.me/${bot}?start=${token}` })
}

/** ยกเลิกการเชื่อมต่อจากหน้าเว็บ (ลูกค้าพิมพ์ /stop ในแชทก็ได้เหมือนกัน) */
export async function DELETE() {
  const customerId = await getCustomerId()
  if (!customerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('customers')
    .update({ telegram_chat_id: null, telegram_linked_at: null })
    .eq('id', customerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** เปิด/ปิดรับแจ้งเตือนโดยไม่ตัดการเชื่อมต่อ */
export async function PATCH(request: Request) {
  const customerId = await getCustomerId()
  if (!customerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { enabled } = await request.json()
  const admin = createAdminClient()
  const { error } = await admin
    .from('customers')
    .update({ telegram_notify: enabled === true })
    .eq('id', customerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
