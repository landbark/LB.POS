import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// favicon ของระบบ = โลโก้ร้านที่ตั้งไว้ในหน้าตั้งค่า
// ทำเป็น route แยกแทนที่จะ query ใน layout เพราะ layout ทำงานทุกหน้า — ตรงนี้ให้ CDN cache ไว้ได้
export const revalidate = 3600

export async function GET() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('store_settings')
    .select('logo_url')
    .limit(1)
    .single()

  // ยังไม่ได้ตั้งโลโก้ → ไม่มีไอคอน เบราว์เซอร์ใช้ของตัวเองไป
  if (!data?.logo_url) return new NextResponse(null, { status: 404 })

  const upstream = await fetch(data.logo_url, { next: { revalidate: 3600 } })
  if (!upstream.ok || !upstream.body) return new NextResponse(null, { status: 404 })

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
