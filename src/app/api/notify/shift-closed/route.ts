import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/require-staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildShiftCloseMessage, notifyEvent } from '@/lib/notify'
import { sumBankMethods, sumByMethod, type PaidTransaction } from '@/lib/payments'

// เรียกจากหน้าปิดกะหลังบันทึกสำเร็จ — พนักงานที่ login แล้วเท่านั้น
// แยกเป็น route เพราะฝั่ง client ไม่มี TELEGRAM_BOT_TOKEN (และไม่ควรมี)
export async function POST(request: NextRequest) {
  // ต้องเป็นพนักงานที่อนุมัติแล้ว — แค่มี session ยังไม่พอ (ดู lib/require-staff)
  if (!(await getStaff())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { shiftId } = await request.json()
  if (!shiftId) return NextResponse.json({ error: 'missing shiftId' }, { status: 400 })

  const admin = createAdminClient()
  // ร้านที่ยังไม่ได้รัน supabase-migration-shift-transfer-check.sql ไม่มี closing_transfers —
  // ขอไปแล้ว query พังทั้งก้อน แจ้งเตือนปิดกะจะเงียบไปเฉย ๆ เลยถอยไปขอเฉพาะคอลัมน์เดิม
  const shiftQuery = (cols: string) =>
    admin.from('shifts').select(cols).eq('id', shiftId).maybeSingle()
  const SHIFT_COLS = 'id, opened_at, closed_at, expected_cash, closing_cash_counted, cash_difference, cash_to_owner, notes, closer:profiles!shifts_closed_by_fkey(name)'
  const shiftRes = await shiftQuery(`${SHIFT_COLS}, closing_transfers`)
  const shift = (shiftRes.error ? (await shiftQuery(SHIFT_COLS)).data : shiftRes.data) as {
    id: string
    opened_at: string
    closed_at: string | null
    expected_cash: number | null
    closing_cash_counted: number | null
    cash_difference: number | null
    cash_to_owner: number | null
    closing_transfers?: Record<string, number> | null
    notes: string | null
    closer: { name: string } | null
  } | null

  if (!shift?.closed_at) return NextResponse.json({ error: 'ยังไม่ได้ปิดกะ' }, { status: 400 })

  // ตั้งเกณฑ์ไว้ = เตือนเฉพาะกะที่เงินขาด/เกินเกินกำหนด (0 = เตือนทุกกะ)
  const { data: settings } = await admin.from('notify_settings').select('*').eq('id', 1).maybeSingle()
  const threshold = Number((settings as Record<string, unknown> | null)?.cash_diff_threshold ?? 0)
  const difference = shift.cash_difference ?? 0
  if (threshold > 0 && Math.abs(difference) < threshold) {
    return NextResponse.json({ sent: false, reason: 'below_threshold' })
  }

  // ยอดขายที่เกิดในช่วงกะนี้ — เฉพาะหน้าร้าน ให้ตรงกับสรุปในหน้าปิดกะ
  // (บูธมีสรุปของรอบเอง ส่วนแพลตฟอร์มไม่ใช่เงินที่รับที่ร้าน ยอดจริงดูที่สรุปของแพลตฟอร์ม)
  const { data: tx } = await admin
    .from('transactions')
    .select('total, payment_method, transaction_payments(method, amount)')
    .eq('status', 'completed')
    .eq('sales_channel', 'store')
    .gte('created_at', shift.opened_at)
    .lt('created_at', shift.closed_at)

  const byMethod = sumByMethod((tx ?? []) as unknown as PaidTransaction[])
  // ยอดที่คนปิดกะเช็คได้จากแอปธนาคาร — ไม่ได้เช็คก็ไม่ต้องขึ้นบรรทัดนั้น
  const transfers = shift.closing_transfers ?? null
  const bankActual = transfers
    ? Object.values(transfers).reduce((s, v) => s + Number(v || 0), 0)
    : null

  const closer = shift.closer

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
      byMethod,
      bankExpected: sumBankMethods(byMethod),
      bankActual,
      notes: shift.notes,
    }),
    { dedupeKey: `shift:${shift.id}:${shift.closed_at}` }
  )

  return NextResponse.json({ sent: true })
}
