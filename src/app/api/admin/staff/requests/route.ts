import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdmin } from '@/lib/require-staff'

const ROLES = ['admin', 'cashier', 'vet', 'vet_plus']
const normalizeRole = (role: unknown) => (ROLES.includes(role as string) ? (role as string) : 'cashier')

// ต้องเป็นแอดมินที่ "ยังอยู่ในทีม" — getAdmin() เช็ค profiles.active ให้ด้วย
// (เช็คแค่ role ไม่พอ: ตอนถอดพนักงานออกระบบตั้ง active = false แต่ role ยังเป็น admin
//  คนที่ถูกถอดจะยิง route นี้เปิดใช้งานบัญชีตัวเองคืนได้)
async function requireAdmin() {
  const admin = await getAdmin()
  if (!admin) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { user: { id: admin.userId } }
}

// อนุมัติ / ปฏิเสธ คำขอเข้าใช้งานที่คนสมัครเองด้วย Google
export async function POST(request: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error

  const body = await request.json()
  const id = String(body.id ?? '')

  // ไม่ให้อนุมัติบัญชีของตัวเอง — คนที่กดต้องเป็นคนอื่นเสมอ
  if (id && id === user!.id) {
    return NextResponse.json({ error: 'อนุมัติบัญชีของตัวเองไม่ได้' }, { status: 400 })
  }
  const action = body.action === 'reject' ? 'reject' : 'approve'
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, name, active')
    .eq('id', id)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'ไม่พบคำขอนี้' }, { status: 404 })
  if (profile.active) return NextResponse.json({ error: 'บัญชีนี้เข้าใช้งานได้อยู่แล้ว' }, { status: 400 })

  if (action === 'reject') {
    // ไม่ลบบัญชีทิ้ง แค่ทำเครื่องหมายไว้ว่าไม่อนุมัติ — เข้าระบบไม่ได้เหมือนเดิม
    // และจะไม่เด้งกลับมาอยู่ในคิวรออนุมัติอีก
    const { error: rejectError } = await admin
      .from('profiles')
      .update({ rejected_at: new Date().toISOString() })
      .eq('id', id)
    if (rejectError) return NextResponse.json({ error: rejectError.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const role = normalizeRole(body.role)
  const name = String(body.name ?? '').trim() || profile.name
  const email = (profile.email ?? '').trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'บัญชีนี้ไม่มีอีเมล อนุมัติไม่ได้' }, { status: 400 })
  }

  // whitelist ยังเป็นตัวตัดสินสิทธิ์เหมือนเดิม (trigger ตอน signup อ่านตารางนี้)
  const { error: whitelistError } = await admin
    .from('staff_emails')
    .upsert({ email, name, role }, { onConflict: 'email' })
  if (whitelistError) return NextResponse.json({ error: whitelistError.message }, { status: 500 })

  const { error: activateError } = await admin
    .from('profiles')
    .update({ active: true, role, name, rejected_at: null })
    .eq('id', id)
  if (activateError) return NextResponse.json({ error: activateError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
