import { NextResponse, type NextRequest } from 'next/server'
import { getCustomerSession, orderCutoff } from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPaymentSlipMessage, notifyEvent } from '@/lib/notify'
import { pushAppNotification } from '@/lib/appNotify'

const BUCKET = 'payment-slips'
const MAX_SIZE = 5 * 1024 * 1024

// ลูกค้าแนบสลิปโอนเงิน → ออเดอร์เข้าคิวรอร้านตรวจสอบ
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCustomerSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const customerId = session.id
  const cutoff = orderCutoff(session)

  const { id } = await params
  const admin = createAdminClient()

  let lookup = admin
    .from('orders')
    .select('id, status, payment_slip_path, order_number, total, recipient_name, customers(name)')
    .eq('id', id)
    .eq('customer_id', customerId)
  // ยังรอร้านยืนยัน = แตะได้แค่ใบที่สั่งเอง ไม่ใช่ของเจ้าของบัญชีเดิม
  if (cutoff) lookup = lookup.gte('created_at', cutoff)

  const { data: order } = await lookup.maybeSingle()

  if (!order) return NextResponse.json({ error: 'ไม่พบออเดอร์' }, { status: 404 })
  if (!['pending_payment', 'awaiting_confirm'].includes(order.status)) {
    return NextResponse.json({ error: 'ออเดอร์นี้ไม่รออัปโหลดสลิปแล้ว' }, { status: 400 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 5MB' }, { status: 400 })
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'แนบได้เฉพาะรูปภาพ' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${id}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error } = await admin
    .from('orders')
    .update({ payment_slip_path: path, paid_reported_at: new Date().toISOString(), status: 'awaiting_confirm' })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // สลิปเก่า (อัปโหลดผิดแล้วส่งใหม่) ไม่ต้องเก็บไว้
  if (order.payment_slip_path) {
    await admin.storage.from(BUCKET).remove([order.payment_slip_path])
  }

  // เตือนให้ไปตรวจสลิป — dedupe ตาม path ของสลิป (ส่งสลิปใหม่ = คนละ path = เตือนอีกครั้ง)
  const customer = order.customers as unknown as { name: string } | null
  await notifyEvent(
    'payment_slip',
    buildPaymentSlipMessage({
      orderNumber: order.order_number,
      orderId: order.id,
      customerName: order.recipient_name || customer?.name || null,
      total: order.total,
    }),
    { dedupeKey: `slip:${path}` }
  )

  await pushAppNotification(admin, {
    kind: 'payment_slip',
    title: `ลูกค้าแจ้งโอนแล้ว ${order.order_number}`,
    body: `${order.recipient_name || customer?.name || 'ลูกค้า'} · ฿${Number(order.total).toLocaleString('th-TH', { minimumFractionDigits: 2 })} — รอตรวจสลิปแล้วยืนยันออเดอร์`,
    link: `/admin/orders/${order.id}`,
  })

  return NextResponse.json({ ok: true })
}
