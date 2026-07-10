import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ผูกบัญชี LINE (จาก LIFF) กับสมาชิกที่มีอยู่แล้ว ด้วยเบอร์โทร — ไม่ต้อง auth เพราะเป็นหน้าลูกค้า
export async function POST(request: NextRequest) {
  const { lineUserId, phone } = await request.json()
  if (!lineUserId || !phone) {
    return NextResponse.json({ error: 'missing lineUserId or phone' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: customer, error } = await admin
    .from('customers')
    .select('id, name, phone, points, total_spent, line_user_id')
    .eq('phone', phone.trim())
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!customer) return NextResponse.json({ error: 'ไม่พบเบอร์นี้ในระบบสมาชิก' }, { status: 404 })

  if (customer.line_user_id && customer.line_user_id !== lineUserId) {
    return NextResponse.json({ error: 'เบอร์นี้ผูกกับบัญชี LINE อื่นไปแล้ว' }, { status: 409 })
  }

  if (customer.line_user_id !== lineUserId) {
    const { error: updateError } = await admin
      .from('customers')
      .update({ line_user_id: lineUserId })
      .eq('id', customer.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    id: customer.id,
    name: customer.name,
    points: customer.points,
    total_spent: customer.total_spent,
  })
}
