import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { homePath } from '@/lib/home-path'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // หน้าแรกตาม role — admin/หมอ ไป dashboard, แคชเชียร์ไปหน้าขาย
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  redirect(homePath(profile?.role))
}
