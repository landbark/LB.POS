import { NextResponse } from 'next/server'
import { getCustomerSession, orderCutoff } from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'

// ลูกค้ายกเลิกออเดอร์เองได้เฉพาะตอนที่ร้านยังไม่ยืนยัน (ยังไม่ตัดสต็อค)
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCustomerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const customerId = session.id
  const cutoff = orderCutoff(session)

  const { id } = await params
  const admin = createAdminClient()

  let lookup = admin
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .eq('customer_id', customerId)
  // ยังรอร้านยืนยัน = แตะได้แค่ใบที่สั่งเอง ไม่ใช่ของเจ้าของบัญชีเดิม
  if (cutoff) lookup = lookup.gte('created_at', cutoff)

  const { data: order } = await lookup.maybeSingle()

  if (!order) return NextResponse.json({ error: 'ไม่พบออเดอร์' }, { status: 404 })
  if (!['pending_payment', 'awaiting_confirm'].includes(order.status)) {
    return NextResponse.json(
      { error: 'ร้านเริ่มจัดของแล้ว — ติดต่อร้านเพื่อยกเลิก' },
      { status: 400 }
    )
  }

  const { error } = await admin
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: 'ลูกค้ายกเลิกเอง',
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
