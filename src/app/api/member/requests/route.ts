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

  const now = new Date().toISOString()

  if (action === 'approve') {
    // ยืนยันได้ต่อเมื่อบัญชีนี้ยังไม่ถูกยืนยันให้ LINE อื่น และ (ถ้ามีคนจับจองอยู่)
    // คนที่จับจองยังเป็นเจ้าของคำขอใบนี้ — กันกดยืนยันให้คนที่มาจับจองทับทีหลัง
    //
    // รองรับสองทางที่คำขอเข้ามา:
    //   /api/shop/link  = จับจองไว้แล้ว (line_user_id ตรงกับคำขอ) เหลือแค่ยืนยัน
    //   /api/member/link = เข้าคิวโดยไม่แตะบัญชี (line_user_id ยังว่าง) ต้องผูกให้ด้วย
    const { data: target } = await admin
      .from('customers')
      .select('line_user_id, line_verified_at')
      .eq('id', req.customer_id)
      .maybeSingle()

    const claimable = target
      && !target.line_verified_at
      && (target.line_user_id === null || target.line_user_id === req.line_user_id)

    const { data: verified, error } = claimable
      ? await admin
          .from('customers')
          .update({ line_user_id: req.line_user_id, line_claimed_at: now, line_verified_at: now })
          .eq('id', req.customer_id)
          .is('line_verified_at', null)
          .select('id')
      : { data: [], error: null }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if ((verified ?? []).length === 0) {
      await admin.from('member_link_requests')
        .update({ status: 'rejected', decided_at: now, decided_by: staff.userId })
        .eq('id', req.id)
      return NextResponse.json(
        { error: 'บัญชีนี้ถูกผูกกับ LINE อื่นไปแล้ว — ให้ลูกค้ากดขอผูกใหม่' },
        { status: 409 }
      )
    }
  } else {
    // ปฏิเสธ = ปลดการจับจองออกด้วย ไม่ใช่แค่ปิดคำขอ
    // (ถ้าปล่อยค้างไว้ คนที่ถูกปฏิเสธยังถือเซสชันของบัญชีนั้นอยู่ และเจ้าตัวจะผูกเบอร์ตัวเองไม่ได้)
    const { error } = await admin
      .from('customers')
      .update({ line_user_id: null, line_claimed_at: null })
      .eq('id', req.customer_id)
      .eq('line_user_id', req.line_user_id)
      .is('line_verified_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { error } = await admin
    .from('member_link_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      decided_at: now,
      decided_by: staff.userId,
    })
    .eq('id', req.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
