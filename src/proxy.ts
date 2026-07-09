import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user && pathname !== '/login' && !pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/pos', request.url))
  }

  if (user && pathname !== '/login' && !pathname.startsWith('/auth')) {
    // select('*') กันพังช่วงก่อนรัน migration (คอลัมน์ active อาจยังไม่มี)
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // ไม่อยู่ใน whitelist พนักงาน → กันเข้าระบบ
    if (profile?.active === false && pathname !== '/no-access') {
      return NextResponse.redirect(new URL('/no-access', request.url))
    }
    if (profile?.active !== false && pathname === '/no-access') {
      return NextResponse.redirect(new URL('/pos', request.url))
    }

    // เฉพาะ admin: ภาพรวม / รายงาน / ตั้งค่า — หน้าอื่นใต้ /admin cashier เข้าได้
    const adminOnlyPaths = ['/admin/dashboard', '/admin/reports', '/admin/settings']
    if (adminOnlyPaths.some((p) => pathname.startsWith(p)) && profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/pos', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
