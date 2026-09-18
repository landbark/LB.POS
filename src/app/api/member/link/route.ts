import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyLineIdToken } from '@/lib/line-id-token'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * ลูกค้าขอผูกบัญชี LINE กับสมาชิกของร้าน ด้วยเบอร์โทร
 *
 * เบอร์โทรอย่างเดียวพิสูจน์ความเป็นเจ้าของไม่ได้ (ใครรู้เบอร์ก็กรอกได้)
 * คำขอจึงเข้าคิวรอให้ทางร้านยืนยันก่อน ไม่ผูกให้ทันที
 *
 * สำคัญ: ตอบ { pending: true } เหมือนกันทุกกรณี ไม่ว่าเบอร์นั้นจะมีในระบบหรือไม่
 * ไม่งั้นใช้ไล่เดาเบอร์เพื่อดูว่าใครเป็นลูกค้าร้านได้
 */
export async function POST(request: NextRequest) {
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
  const { data: customer } = await admin
    .from('customers')
    .select('id, name, points, total_spent, line_user_id')
    .eq('phone', phone)
    .maybeSingle()

  // ผูกไว้แล้วกับ LINE เครื่องนี้ — เข้าได้เลย ไม่ต้องขอใหม่
  if (customer?.line_user_id === lineUserId) {
    return NextResponse.json({
      linked: true,
      customer: {
        id: customer.id,
        name: customer.name,
        points: customer.points,
        total_spent: customer.total_spent,
      },
    })
  }

  // เข้าคิวเฉพาะกรณีที่เบอร์มีจริงและยังไม่ถูกผูกกับใคร
  // กรณีอื่นไม่สร้างอะไร แต่ตอบเหมือนกัน เพื่อไม่ให้รู้ว่าเบอร์ไหนมีในระบบ
  if (customer && !customer.line_user_id) {
    await admin.from('member_link_requests').delete()
      .eq('line_user_id', lineUserId).eq('status', 'pending')

    await admin.from('member_link_requests').insert({
      line_user_id: lineUserId,
      phone,
      customer_id: customer.id,
    })
  }

  return NextResponse.json({ pending: true })
}
