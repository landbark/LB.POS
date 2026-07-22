import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES = ['admin', 'cashier', 'vet']
const normalizeRole = (role: unknown) => (ROLES.includes(role as string) ? (role as string) : 'cashier')

// ตรวจว่า caller เป็น admin ก่อนใช้ service role ทุกครั้ง
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return { user }
}

// หา auth user id จากอีเมล (profiles.email ถูก sync จาก trigger/migration)
async function findUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  return data?.id ?? null
}

// เพิ่มพนักงาน: ใส่ whitelist เสมอ; ถ้าระบุรหัสผ่าน → สร้าง user ให้เลย (เข้า Google ก็ได้)
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const body = await request.json()
  const email = (body.email ?? '').trim().toLowerCase()
  const name = (body.name ?? '').trim()
  const role = normalizeRole(body.role)
  const password = body.password?.trim() || null

  if (!email || !name) {
    return NextResponse.json({ error: 'กรุณากรอกอีเมลและชื่อ' }, { status: 400 })
  }
  if (password && password.length < 6) {
    return NextResponse.json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' }, { status: 400 })
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
    if (password) {
      await admin.auth.admin.updateUserById(existingId, { password })
    }
  } else if (password) {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    })
    if (createError) {
      // ถอน whitelist ที่เพิ่งใส่ ให้กดเพิ่มใหม่ได้หลังแก้ปัญหา
      await admin.from('staff_emails').delete().eq('email', email)
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true })
}

// แก้ไขพนักงาน: เปลี่ยน role / ชื่อ / ตั้งรหัสผ่านใหม่
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

  if (body.password) {
    const password = body.password.trim()
    if (password.length < 6) {
      return NextResponse.json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' }, { status: 400 })
    }
    if (!userId) {
      return NextResponse.json(
        { error: 'พนักงานคนนี้ยังไม่เคยเข้าระบบ — ใช้วิธีลบแล้วเพิ่มใหม่พร้อมตั้งรหัสผ่านแทน' },
        { status: 400 }
      )
    }
    const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password })
    if (pwError) return NextResponse.json({ error: pwError.message }, { status: 400 })
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
    await admin.from('profiles').update({ active: false }).eq('id', userId)
  }

  return NextResponse.json({ ok: true })
}
