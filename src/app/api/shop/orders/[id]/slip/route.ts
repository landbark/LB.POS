import { NextResponse, type NextRequest } from 'next/server'
import { getCustomerId } from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'payment-slips'
const MAX_SIZE = 5 * 1024 * 1024

// ลูกค้าแนบสลิปโอนเงิน → ออเดอร์เข้าคิวรอร้านตรวจสอบ
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const customerId = await getCustomerId()
  if (!customerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, status, payment_slip_path')
    .eq('id', id)
    .eq('customer_id', customerId)
    .maybeSingle()

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

  return NextResponse.json({ ok: true })
}
