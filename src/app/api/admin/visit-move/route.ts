import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStaff } from '@/lib/require-staff'
import { canExamine } from '@/lib/roles'

/**
 * ย้ายใบตรวจไปสัตว์อีกตัว — ใช้ตอนลงผลตรวจผิดตัว (คนละตัวจริง ๆ ไม่ใช่ใบซ้ำ)
 *
 * งานจริงอยู่ในฟังก์ชัน move_visit() ของ DB เพราะต้องแตะหลายตาราง
 * และต้องปลดล็อก trigger ของเอกสารคลินิกชั่วคราว ซึ่งทำจากฝั่งนี้ไม่ได้
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const staff = await getStaff()
  // หมอกับแอดมินเท่านั้น — คนที่แก้เวชระเบียนได้อยู่แล้ว (ฟังก์ชันใน DB เช็คซ้ำอีกชั้น)
  if (!staff || !canExamine(staff.role)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const visitId = typeof body?.visitId === 'string' ? body.visitId : ''
  const petId = typeof body?.petId === 'string' ? body.petId : ''
  const moveOwner = body?.moveOwner !== false

  if (!UUID.test(visitId)) return NextResponse.json({ error: 'ไม่พบใบตรวจ' }, { status: 400 })
  if (!UUID.test(petId)) return NextResponse.json({ error: 'ยังไม่ได้เลือกสัตว์ปลายทาง' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('move_visit', {
    p_visit: visitId,
    p_pet: petId,
    p_move_owner: moveOwner,
  })

  if (error) {
    if (error.code === '42883') {
      return NextResponse.json(
        { error: 'ยังไม่ได้ติดตั้งฟังก์ชันย้ายใบตรวจใน DB — รัน supabase-migration-move-visit.sql ก่อน' },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ result: data })
}
