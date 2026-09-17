import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildShiftCloseMessage, notifyEvent } from '@/lib/notify'

// เรียกจากหน้าปิดกะหลังบันทึกสำเร็จ — พนักงานที่ login แล้วเท่านั้น
// แยกเป็น route เพราะฝั่ง client ไม่มี TELEGRAM_BOT_TOKEN (และไม่ควรมี)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { shiftId } = await request.json()
  if (!shiftId) return NextResponse.json({ error: 'missing shiftId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: shift } = await admin
    .from('shifts')
    .select('id, opened_at, closed_at, expected_cash, closing_cash_counted, cash_difference, cash_to_owner, notes, closer:profiles!shifts_closed_by_fkey(name)')
    .eq('id', shiftId)
    .maybeSingle()

  if (!shift?.closed_at) return NextResponse.json({ error: 'ยังไม่ได้ปิดกะ' }, { status: 400 })

  // ตั้งเกณฑ์ไว้ = เตือนเฉพาะกะที่เงินขาด/เกินเกินกำหนด (0 = เตือนทุกกะ)
  const { data: settings } = await admin.from('notify_settings').select('*').eq('id', 1).maybeSingle()
  const threshold = Number((settings as Record<string, unknown> | null)?.cash_diff_threshold ?? 0)
  const difference = shift.cash_difference ?? 0
  if (threshold > 0 && Math.abs(difference) < threshold) {
    return NextResponse.json({ sent: false, reason: 'below_threshold' })
  }

  // ยอดขายที่เกิดในช่วงกะนี้
  const { data: tx } = await admin
    .from('transactions')
    .select('total')
    .eq('status', 'completed')
    .gte('created_at', shift.opened_at)
    .lt('created_at', shift.closed_at)

  const closer = shift.closer as unknown as { name: string } | null

  await notifyEvent(
    'shift_close',
    buildShiftCloseMessage({
      closedBy: closer?.name ?? null,
      expectedCash: shift.expected_cash ?? 0,
      countedCash: shift.closing_cash_counted ?? 0,
      difference,
      cashToOwner: shift.cash_to_owner ?? 0,
      salesTotal: (tx ?? []).reduce((s, t) => s + t.total, 0),
      txCount: tx?.length ?? 0,
      notes: shift.notes,
    }),
    { dedupeKey: `shift:${shift.id}:${shift.closed_at}` }
  )

  return NextResponse.json({ sent: true })
}
