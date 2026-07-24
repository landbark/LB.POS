import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { homePath } from '@/lib/home-path'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // สร้าง profile ถ้ายังไม่มี
      const { data: { user } } = await supabase.auth.getUser()
      let role: string | null = 'cashier'
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (!profile) {
          await supabase.from('profiles').insert({
            id: user.id,
            role: 'cashier',
            name: user.user_metadata?.full_name ?? user.email ?? 'User',
          })
        } else {
          role = profile.role
        }
      }

      // หน้าแรกตาม role — admin/หมอ ไป dashboard, แคชเชียร์ไปหน้าขาย
      return NextResponse.redirect(`${origin}${homePath(role)}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
