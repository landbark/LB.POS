import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/require-staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildShiftOpenMessage, notifyEvent } from '@/lib/notify'
import type { ShiftOpenMismatch } from '@/lib/shiftOpen'

// เรียกจากหน้าเปิดกะหลังเปิดสำเร็จ และเฉพาะตอนเงินที่นับได้ไม่ตรงกับที่ควรมี
// (ดู lib/shiftOpen → openShift คืน mismatch มาให้) แยกเป็น route เพราะฝั่ง client
// ไม่มี TELEGRAM_BOT_TOKEN — เหมือน /api/notify/shift-closed
export async function POST(request: NextRequest) {
  if (!(await getStaff())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { shiftId, mismatch } = (await request.json()) as {
    shiftId?: string
    mismatch?: ShiftOpenMismatch
  }
  if (!shiftId || !mismatch) return NextResponse.json({ error: 'missing shiftId/mismatch' }, { status: 400 })

  const admin = createAdminClient()
  const { data: shift } = await admin
    .from('shifts')
    .select('id, closed_at, opening_cash, opener:profiles!shifts_opened_by_fkey(name)')
    .eq('id', shiftId)
    .maybeSingle<{
      id: string
      closed_at: string | null
      opening_cash: number
      opener: { name: string } | null
    }>()

  if (!shift) return NextResponse.json({ error: 'ไม่พบกะนี้' }, { status: 404 })
  if (shift.closed_at) return NextResponse.json({ error: 'กะนี้ปิดไปแล้ว' }, { status: 400 })

  // ยอดตั้งต้นที่บันทึกไว้ต้องเข้ากับตัวเลขที่ส่งมา (หักบิลหลังปิดกะแล้วหรือยังก็ได้) —
  // กันข้อความที่ตัวเลขไม่ตรงกับของจริงในตารางหลุดไปถึงเจ้าของ
  const stored = Number(shift.opening_cash)
  const ok = [mismatch.counted, mismatch.counted - mismatch.pending].some((v) => Math.abs(v - stored) < 0.005)
  if (!ok) return NextResponse.json({ error: 'ตัวเลขไม่ตรงกับยอดตั้งต้นที่บันทึกไว้' }, { status: 400 })

  // ใช้เกณฑ์เดียวกับปิดกะ — เจ้าของตั้งที่เดียวแล้วคุมทั้งสองฝั่ง (0 = เตือนทุกครั้ง)
  const { data: settings } = await admin.from('notify_settings').select('*').eq('id', 1).maybeSingle()
  const threshold = Number((settings as Record<string, unknown> | null)?.cash_diff_threshold ?? 0)
  if (threshold > 0 && Math.abs(mismatch.diff) < threshold) {
    return NextResponse.json({ sent: false, reason: 'below_threshold' })
  }

  await notifyEvent(
    'shift_open',
    buildShiftOpenMessage({
      // ชื่อคนเปิดกะเอาจากตาราง ไม่เอาจากที่ client ส่งมา
      openedBy: shift.opener?.name ?? null,
      carry: mismatch.carry,
      carryClosedAt: mismatch.carryClosedAt,
      carryCounted: mismatch.carryCounted,
      toOwner: mismatch.toOwner,
      pending: mismatch.pending,
      pendingBills: mismatch.pendingBills,
      pendingParts: mismatch.pendingParts ?? [],
      expected: mismatch.expected,
      counted: mismatch.counted,
      diff: mismatch.diff,
      reason: mismatch.reason ?? '',
    }),
    { dedupeKey: `shiftopen:${shift.id}` }
  )

  return NextResponse.json({ sent: true })
}
