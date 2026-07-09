import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'product-images'
const MAX_SIZE = 1024 * 1024 // 1MB — รูปถูก compress ฝั่ง browser แล้ว ควรเล็กกว่านี้มาก

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// อัปโหลดรูปสินค้า (ผ่าน service role — ไม่ต้องเปิด storage policy ฝั่ง client)
export async function POST(request: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกินไป (เกิน 1MB)' }, { status: 400 })
  }

  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`

  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}

// ลบรูปเดิมตอนเปลี่ยน/ลบรูปสินค้า
export async function DELETE(request: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { url } = await request.json()
  const marker = `/object/public/${BUCKET}/`
  const idx = typeof url === 'string' ? url.indexOf(marker) : -1
  if (idx === -1) return NextResponse.json({ error: 'invalid url' }, { status: 400 })

  const path = decodeURIComponent(url.slice(idx + marker.length))
  const admin = createAdminClient()
  await admin.storage.from(BUCKET).remove([path])
  return NextResponse.json({ ok: true })
}
