import { createClient } from '@/lib/supabase/server'
import ShiftClient from './ShiftClient'

export default async function ShiftPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // เฉพาะเจ้าของร้านที่แก้ยอดกะที่ปิดไปแล้วได้ (เป็นบันทึกเงิน)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user?.id ?? '')
    .maybeSingle()

  const SHIFT_COLS = `
    id, opened_at, opened_by, opening_cash, closed_at, closed_by,
    expected_cash, closing_cash_counted, cash_difference, notes,
    closing_denominations, cash_to_owner, owner_denominations, opening_denominations
  `
  const historyQuery = (extra: string) =>
    supabase
      .from('shifts')
      .select(`
        ${SHIFT_COLS}${extra},
        opener:profiles!shifts_opened_by_fkey(name),
        closer:profiles!shifts_closed_by_fkey(name)
      `)
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(20)

  const [{ data: openShift }, historyRes, { data: store }] = await Promise.all([
    supabase
      .from('shifts')
      .select(`
        ${SHIFT_COLS},
        opener:profiles!shifts_opened_by_fkey(name)
      `)
      .is('closed_at', null)
      .maybeSingle(),
    historyQuery(', carry_denominations, carry_adjusted_at'),
    supabase.from('store_settings').select('float_target, float_denoms').limit(1).maybeSingle(),
  ])
  // ยังไม่ได้รัน migration จัดเงินทอนหลังปิดกะ — ประวัติกะต้องยังขึ้น แค่ไม่มีคอลัมน์นั้น
  const history = historyRes.error ? (await historyQuery('')).data : historyRes.data

  return (
    <ShiftClient
      openShift={(openShift as never) ?? null}
      history={(history as never[]) ?? []}
      currentUserId={user?.id ?? ''}
      currentUserName={profile?.name ?? ''}
      canEditClosed={profile?.role === 'admin'}
      floatTarget={store?.float_target != null ? Number(store.float_target) : null}
      floatDenoms={(store?.float_denoms as Record<string, number> | null) ?? null}
    />
  )
}
