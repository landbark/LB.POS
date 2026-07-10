import { createClient } from '@/lib/supabase/server'
import ShiftClient from './ShiftClient'

export default async function ShiftPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: openShift }, { data: history }] = await Promise.all([
    supabase
      .from('shifts')
      .select(`
        id, opened_at, opened_by, opening_cash, closed_at, closed_by,
        expected_cash, closing_cash_counted, cash_difference, notes,
        opener:profiles!shifts_opened_by_fkey(name)
      `)
      .is('closed_at', null)
      .maybeSingle(),
    supabase
      .from('shifts')
      .select(`
        id, opened_at, opened_by, opening_cash, closed_at, closed_by,
        expected_cash, closing_cash_counted, cash_difference, notes,
        opener:profiles!shifts_opened_by_fkey(name),
        closer:profiles!shifts_closed_by_fkey(name)
      `)
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(20),
  ])

  return (
    <ShiftClient
      openShift={(openShift as never) ?? null}
      history={(history as never[]) ?? []}
      currentUserId={user?.id ?? ''}
    />
  )
}
