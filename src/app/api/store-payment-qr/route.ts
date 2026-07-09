import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'store-assets'
// ไม่ผ่านการ crop/บีบอัดฝั่ง browser เหมือนโลโก้ — QR ต้องคมชัด ไม่ให้ compress จนสแกนไม่ติด
const MAX_SIZE = 3 * 1024 * 1024 // 3MB

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return {}
}

// อัปโหลดรูป QR รับเงิน static (เช่น QR ของ K SHOP) — เก็บไฟล์ต้นฉบับตรงๆ ไม่ย่อ/บีบอัด กันสแกนไม่ติด
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'ต้องเป็นไฟล์รูปภาพ' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกินไป (เกิน 3MB)' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `payment-qr-${crypto.randomUUID()}.${ext}`

  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}

// ลบรูป QR เดิมตอนเปลี่ยน/ลบ
export async function DELETE(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const { url } = await request.json()
  const marker = `/object/public/${BUCKET}/`
  const idx = typeof url === 'string' ? url.indexOf(marker) : -1
  if (idx === -1) return NextResponse.json({ error: 'invalid url' }, { status: 400 })

  const path = decodeURIComponent(url.slice(idx + marker.length))
  const admin = createAdminClient()
  await admin.storage.from(BUCKET).remove([path])
  return NextResponse.json({ ok: true })
}
