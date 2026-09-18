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

    if (error) {
      // trigger handle_new_user ปฏิเสธอีเมลที่ไม่อยู่ใน staff_emails
      const blocked = /อนุญาต|insufficient_privilege|Database error/i.test(error.message)
      return NextResponse.redirect(`${origin}/login?error=${blocked ? 'not-allowed' : 'auth'}`)
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(`${origin}/login?error=auth`)

    // โปรไฟล์ถูกสร้างโดย trigger ตอนสมัครเท่านั้น — ไม่สร้างเองตรงนี้
    // (เดิมสร้างให้อัตโนมัติ ซึ่งเปิดทางให้คนนอก whitelist มีโปรไฟล์ได้)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, active')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || profile.active === false) {
      return NextResponse.redirect(`${origin}/no-access`)
    }

    // หน้าแรกตาม role — admin/หมอ ไป dashboard, แคชเชียร์ไปหน้าขาย
    return NextResponse.redirect(`${origin}${homePath(profile.role)}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
