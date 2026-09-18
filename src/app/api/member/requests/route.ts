import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaff } from '@/lib/require-staff'

/**
 * ยืนยัน/ปฏิเสธคำขอผูกบัญชีสมาชิก
 *
 * พนักงานทุกคนที่ได้รับอนุมัติแล้วกดได้ ไม่ใช่เฉพาะเจ้าของร้าน
 * เพราะลูกค้ามักยืนรออยู่หน้าร้านตอนขอผูก
 */
export async function POST(request: NextRequest) {
  const staff = await getStaff()
  if (!staff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id, action } = await request.json().catch(() => ({}))
  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'คำขอไม่ถูกต้อง' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: req } = await admin
    .from('member_link_requests')
    .select('id, line_user_id, customer_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!req) return NextResponse.json({ error: 'ไม่พบคำขอ' }, { status: 404 })
  if (req.status !== 'pending') {
    return NextResponse.json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว' }, { status: 409 })
  }

  if (action === 'approve') {
    // ผูกได้ต่อเมื่อยังว่างอยู่จริง — กันกรณีมีคนผูกไปแล้วระหว่างรอ
    const { data: linked, error } = await admin
      .from('customers')
      .update({ line_user_id: req.line_user_id })
      .eq('id', req.customer_id)
      .is('line_user_id', null)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if ((linked ?? []).length === 0) {
      await admin.from('member_link_requests')
        .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: staff.userId })
        .eq('id', req.id)
      return NextResponse.json({ error: 'บัญชีนี้ถูกผูกกับ LINE อื่นไปแล้ว' }, { status: 409 })
    }
  }

  const { error } = await admin
    .from('member_link_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      decided_at: new Date().toISOString(),
      decided_by: staff.userId,
    })
    .eq('id', req.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
