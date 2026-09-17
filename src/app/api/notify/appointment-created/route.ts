import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildNewAppointmentMessage, notifyEvent } from '@/lib/notify'

// เรียกหลังบันทึกนัดใหม่สำเร็จ (หน้านัดหมาย + หน้า OPD) — พนักงานที่ login แล้วเท่านั้น
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { appointmentId } = await request.json()
  if (!appointmentId) return NextResponse.json({ error: 'missing appointmentId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: appointment } = await admin
    .from('appointments')
    .select('id, scheduled_at, type, notes, status, pets(name), customers(name, phone), creator:profiles!appointments_created_by_fkey(name)')
    .eq('id', appointmentId)
    .maybeSingle()

  if (!appointment) return NextResponse.json({ error: 'ไม่พบนัดหมาย' }, { status: 404 })

  const pet = appointment.pets as unknown as { name: string } | null
  const owner = appointment.customers as unknown as { name: string; phone: string } | null
  const creator = appointment.creator as unknown as { name: string } | null

  await notifyEvent(
    'new_appointment',
    buildNewAppointmentMessage({
      petName: pet?.name ?? '—',
      ownerName: owner?.name ?? null,
      ownerPhone: owner?.phone ?? null,
      type: appointment.type,
      scheduledAt: appointment.scheduled_at,
      notes: appointment.notes,
      createdBy: creator?.name ?? null,
    }),
    // แก้เวลานัดแล้วถือเป็นคนละครั้ง — จะได้รู้ว่าเลื่อนไปวันไหน
    { dedupeKey: `appointment:${appointment.id}:${appointment.scheduled_at}` }
  )

  return NextResponse.json({ ok: true })
}
