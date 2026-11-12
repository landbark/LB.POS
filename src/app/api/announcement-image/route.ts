import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdmin } from '@/lib/require-staff'

const BUCKET = 'store-assets'
const MAX_SIZE = 1024 * 1024 // 1MB — รูปถูก compress ฝั่ง browser แล้ว

// ต้องเป็นแอดมินที่ "ยังอยู่ในทีม" — getAdmin() เช็ค profiles.active ให้ด้วย
// (เช็คแค่ role ไม่พอ: ตอนถอดพนักงานออกระบบตั้ง active = false แต่ role ยังเป็น admin)
async function requireAdmin() {
  if (!(await getAdmin())) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return {}
}

// รูปประกอบประกาศข่าว — เก็บใน bucket เดียวกับโลโก้ร้าน (public) คนละ prefix
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'missing file' }, { status: 400 })
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'แนบได้เฉพาะรูปภาพ' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกินไป (เกิน 1MB)' }, { status: 400 })
  }

  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
  const path = `news-${crypto.randomUUID()}.${ext}`

  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}

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
