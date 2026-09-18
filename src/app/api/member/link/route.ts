import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyLineIdToken } from '@/lib/line-id-token'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * ผูกบัญชี LINE (จาก LIFF) กับสมาชิกที่มีอยู่แล้ว ด้วยเบอร์โทร
 *
 * เดิมเชื่อ lineUserId ที่ client ส่งมา และคืนชื่อ/แต้ม/ยอดซื้อของเจ้าของเบอร์
 * กลับไปด้วย ทำให้ไล่เดาเบอร์เพื่อดูว่าใครเป็นลูกค้าร้าน และดูดข้อมูลได้
 *
 * ตอนนี้: ต้องยืนยัน ID token กับ LINE ก่อน · จำกัดจำนวนครั้ง ·
 * ไม่คืนข้อมูลของคนอื่นกลับไปไม่ว่ากรณีใด
 */
export async function POST(request: NextRequest) {
  // ผูกบัญชีเป็นงานที่ทำครั้งเดียว — เรียกถี่ ๆ คือกำลังไล่เดาเบอร์
  const limited = rateLimit(`member-link:${clientIp(request)}`, { limit: 5, windowMs: 10 * 60_000 })
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'ลองหลายครั้งเกินไป กรุณารอสักครู่' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }

  const body = await request.json().catch(() => ({}))
  const lineUserId = await verifyLineIdToken(body.idToken)
  if (!lineUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const phone = String(body.phone ?? '').trim()
  if (!/^[0-9]{9,10}$/.test(phone.replace(/[-\s]/g, ''))) {
    return NextResponse.json({ error: 'กรุณากรอกเบอร์โทรให้ถูกต้อง' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: customer, error } = await admin
    .from('customers')
    .select('id, name, phone, points, total_spent, line_user_id')
    .eq('phone', phone)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ข้อความและสถานะเดียวกันทั้ง "ไม่พบเบอร์" กับ "ผูกกับคนอื่นแล้ว"
  // ไม่งั้นใช้แยกได้ว่าเบอร์ไหนเป็นลูกค้าร้าน
  const refuse = () => NextResponse.json(
    { error: 'ผูกบัญชีไม่สำเร็จ — ตรวจสอบเบอร์โทรอีกครั้ง หรือติดต่อร้าน' },
    { status: 404 }
  )

  if (!customer) return refuse()
  if (customer.line_user_id && customer.line_user_id !== lineUserId) return refuse()

  if (!customer.line_user_id) {
    const { error: updateError } = await admin
      .from('customers')
      .update({ line_user_id: lineUserId })
      .eq('id', customer.id)
      // กันแย่งผูกพร้อมกัน — อัปเดตได้ต่อเมื่อยังว่างอยู่จริง
      .is('line_user_id', null)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    points: customer.points,
    total_spent: customer.total_spent,
  })
}
