import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminNav from '@/components/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/pos')
  // cashier เข้าได้บางหน้า (สินค้า/สต็อค/นำเข้า/ซัพพลายเออร์) — หน้าเฉพาะ admin ถูกกันที่ proxy.ts

  return (
    <div className="min-h-screen flex">
      <AdminNav userName={profile.name} role={profile.role} />
      <main className="flex-1 md:ml-56 p-4 pt-18 md:p-6 md:pt-6 min-w-0">{children}</main>
    </div>
  )
}
