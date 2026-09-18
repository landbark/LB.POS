import { createClient } from '@/lib/supabase/server'

/**
 * ตรวจว่าผู้เรียกเป็นพนักงานที่ "ได้รับอนุมัติแล้ว" จริง ๆ
 *
 * getUser() อย่างเดียวไม่พอ — ใครก็ตามที่ล็อกอิน Google เข้ามาได้ JWT ทันที
 * แต่ profiles.active ยังเป็น false รออนุมัติอยู่ ถ้าเช็คแค่ว่ามี session
 * คนที่ยังไม่ได้รับอนุมัติจะยิง API ของหลังร้านได้หมด
 */
export interface StaffContext {
  userId: string
  role: string
  name: string | null
}

export async function getStaff(): Promise<StaffContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // select('*') กันพังช่วงก่อนรัน migration ที่เพิ่มคอลัมน์ใหม่
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  const profile = data as Record<string, unknown> | null

  // active = false คือรออนุมัติ หรือถูกเอาออกจากทีมแล้ว
  if (!profile || profile.active === false) return null

  return {
    userId: user.id,
    role: String(profile.role ?? 'cashier'),
    name: (profile.name as string | null) ?? null,
  }
}

export async function getAdmin(): Promise<StaffContext | null> {
  const staff = await getStaff()
  return staff?.role === 'admin' ? staff : null
}
