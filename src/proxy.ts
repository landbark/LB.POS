import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { homePath } from '@/lib/home-path'

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

  // หน้าลูกค้า (ผ่าน LINE LIFF เช็คแต้มเอง) ไม่ต้อง login พนักงาน
  const isPublicPath = pathname === '/login' || pathname.startsWith('/auth')
    || pathname === '/member' || pathname.startsWith('/api/member')
    || pathname.startsWith('/print/receipt')
    // Vercel Cron ไม่มี session พนักงาน — route เช็ค CRON_SECRET เอง
    || pathname.startsWith('/api/cron')
    // Telegram เรียก webhook เอง (ไม่มี session) — route เช็ค secret token header เอง
    || pathname.startsWith('/api/telegram')

  if (!user && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    return NextResponse.redirect(new URL(homePath(profile?.role), request.url))
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
      return NextResponse.redirect(new URL(homePath(profile?.role), request.url))
    }

    // เฉพาะ admin: รายงาน / ตั้งค่า / โปรโมชั่น (RLS ก็บังคับ admin เท่านั้นอยู่แล้ว) — หน้าอื่นใต้ /admin cashier เข้าได้
    const adminOnlyPaths = ['/admin/reports', '/admin/settings', '/admin/promotions']
    if (adminOnlyPaths.some((p) => pathname.startsWith(p)) && profile?.role !== 'admin') {
      return NextResponse.redirect(new URL(homePath(profile?.role), request.url))
    }

    // Dashboard (ภาพรวม): admin + หมอ เข้าได้ (เป็นหน้าแรกของทั้งคู่) — แคชเชียร์ให้ไปหน้าขาย
    if (pathname.startsWith('/admin/dashboard') && profile?.role !== 'admin' && profile?.role !== 'vet') {
      return NextResponse.redirect(new URL(homePath(profile?.role), request.url))
    }

    // สัตวแพทย์: ทำงานคลินิก + ดูสินค้า/สต็อค/ลูกค้าได้ แต่ไม่ยุ่งกับการขาย/จัดซื้อ/เงิน
    // (RLS ฝั่ง DB กันการเขียนไว้อีกชั้น — ตรงนี้แค่ไม่ให้หลงเข้าหน้าที่ใช้ไม่ได้)
    const vetBlockedPaths = ['/pos', '/admin/receiving', '/admin/suppliers', '/admin/shift', '/admin/daily', '/admin/documents']
    if (profile?.role === 'vet' && vetBlockedPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return NextResponse.redirect(new URL(homePath('vet'), request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
