import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CashierNav from '@/components/CashierNav'

export default async function CashierLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen flex flex-col">
      <CashierNav userName={profile?.name ?? ''} isAdmin={profile?.role === 'admin'} />
      <main className="flex-1 pt-14">{children}</main>
    </div>
  )
}
