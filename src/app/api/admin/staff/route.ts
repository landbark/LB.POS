import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdmin } from '@/lib/require-staff'

const ROLES = ['admin', 'cashier', 'vet', 'vet_plus']
const normalizeRole = (role: unknown) => (ROLES.includes(role as string) ? (role as string) : 'cashier')

// ตรวจว่า caller เป็นแอดมินที่ยังใช้งานอยู่ ก่อนใช้ service role ทุกครั้ง
async function requireAdmin() {
  const admin = await getAdmin()
  if (!admin) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { user: { id: admin.userId } }
}

/**
 * หา auth user id จากอีเมล (profiles.email ถูก sync จาก trigger/migration)
 *
 * ห้ามใช้ ilike ตรง ๆ กับอีเมล — '_' และ '%' เป็น wildcard ของ LIKE
 * อีเมลอย่าง arm_mani@gmail.com จะไปแมตช์ armXmani@gmail.com ของคนอื่นได้
 * แล้วไปตั้งรหัสผ่าน/ปิดบัญชีผิดคน (อีเมลถูกเก็บเป็น lowercase อยู่แล้ว)
 */
async function findUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  return data?.id ?? null
}

// เพิ่มพนักงาน: ใส่อีเมลลง whitelist — พนักงานเข้าครั้งแรกด้วย Google แล้ว trigger
// handle_new_user จะสร้างโปรไฟล์ให้ตาม role ที่ตั้งไว้ในรายชื่อ
//
// ระบบนี้ไม่ใช้รหัสผ่านแล้ว (เข้าทาง Google อย่างเดียว) — ไม่มีรหัสให้เดา/รั่ว
// และได้ 2-step ของ Google มาด้วย ถ้าต้องเปิดทางรหัสผ่านฉุกเฉิน ทำที่ Supabase
// → Authentication → Providers → Email
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const body = await request.json()
  const email = (body.email ?? '').trim().toLowerCase()
  const name = (body.name ?? '').trim()
  const role = normalizeRole(body.role)

  if (!email || !name) {
    return NextResponse.json({ error: 'กรุณากรอกอีเมลและชื่อ' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error: insertError } = await admin
    .from('staff_emails')
    .insert({ email, name, role })
  if (insertError) {
    return NextResponse.json(
      { error: insertError.code === '23505' ? 'อีเมลนี้อยู่ในรายชื่อแล้ว' : insertError.message },
      { status: 400 }
    )
  }

  // เคยล็อกอินมาก่อน (โปรไฟล์ค้างแบบ inactive) → เปิดใช้งาน + อัปเดต role
  const existingId = await findUserIdByEmail(admin, email)
  if (existingId) {
    await admin.from('profiles').update({ active: true, role, name }).eq('id', existingId)
  }

  return NextResponse.json({ ok: true })
}

// แก้ไขพนักงาน: เปลี่ยน role / ชื่อ
export async function PATCH(request: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error

  const body = await request.json()
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 })

  const admin = createAdminClient()
  const userId = await findUserIdByEmail(admin, email)

  if (body.role || body.name) {
    const updates: Record<string, string> = {}
    if (body.role) updates.role = normalizeRole(body.role)
    if (body.name) updates.name = body.name.trim()

    // กันลดสิทธิ์ตัวเอง (จะล็อกตัวเองออกจากหน้าตั้งค่า)
    if (updates.role && updates.role !== 'admin' && userId === user!.id) {
      return NextResponse.json({ error: 'ไม่สามารถลดสิทธิ์ของตัวเองได้' }, { status: 400 })
    }

    const { error: updateError } = await admin.from('staff_emails').update(updates).eq('email', email)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })
    if (userId) await admin.from('profiles').update(updates).eq('id', userId)
  }

  return NextResponse.json({ ok: true })
}

// ลบพนักงานออกจาก whitelist + ปิดการใช้งานบัญชี (ไม่ลบประวัติการขาย)
export async function DELETE(request: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error

  const body = await request.json()
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 })

  const admin = createAdminClient()
  const userId = await findUserIdByEmail(admin, email)

  if (userId === user!.id) {
    return NextResponse.json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' }, { status: 400 })
  }

  await admin.from('staff_emails').delete().eq('email', email)
  if (userId) {
    // ลด role ลงด้วย ไม่ใช่แค่ปิดใช้งาน — role ที่ค้างเป็น 'admin' ทำให้โค้ดที่เช็คแค่ role
    // (โดยไม่เช็ค active) ยังนับคนที่ถูกถอดออกไปแล้วว่าเป็นแอดมิน
    await admin.from('profiles').update({ active: false, role: 'cashier' }).eq('id', userId)
  }

  return NextResponse.json({ ok: true })
}
