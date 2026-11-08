import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaff } from '@/lib/require-staff'
import { canExamine } from '@/lib/roles'

const BUCKET = 'visit-attachments'
const MAX_SIZE = 3 * 1024 * 1024 // 3MB — รูปถูกย่อ/บีบฝั่งเบราว์เซอร์แล้ว ปกติไม่ถึง 500KB
const SIGNED_TTL = 60 * 60 * 2   // URL ชั่วคราว 2 ชม. พอสำหรับหน้าที่เปิดค้างไว้

// แนบรูปในเวชระเบียน — พนักงานทุก role แนบได้ (แคชเชียร์ด้วย) และแนบย้อนหลังได้
// ผ่าน service role เพราะบัคเก็ตเป็นแบบส่วนตัว ไม่ได้เปิด storage policy ฝั่ง client
export async function POST(request: NextRequest) {
  const staff = await getStaff()
  if (!staff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')
  const visitId = formData.get('visit_id')
  const caption = formData.get('caption')

  if (!(file instanceof File)) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
  if (typeof visitId !== 'string' || !visitId) {
    return NextResponse.json({ error: 'ไม่พบเวชระเบียน' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'แนบได้เฉพาะรูปภาพ' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 3MB' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ใบที่ยกเลิกแล้วไม่ต้องแนบเพิ่ม
  const { data: visit } = await admin
    .from('visits')
    .select('id, status')
    .eq('id', visitId)
    .maybeSingle()
  if (!visit) return NextResponse.json({ error: 'ไม่พบเวชระเบียน' }, { status: 404 })
  if (visit.status === 'cancelled') {
    return NextResponse.json({ error: 'เวชระเบียนนี้ถูกยกเลิกแล้ว' }, { status: 400 })
  }

  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${visitId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const toInt = (v: FormDataEntryValue | null) => {
    const n = typeof v === 'string' ? parseInt(v, 10) : NaN
    return Number.isFinite(n) ? n : null
  }

  const { data: row, error } = await admin
    .from('visit_attachments')
    .insert({
      visit_id: visitId,
      path,
      caption: typeof caption === 'string' && caption.trim() ? caption.trim() : null,
      width: toInt(formData.get('width')),
      height: toInt(formData.get('height')),
      size: file.size,
      uploaded_by: staff.userId,
    })
    .select('*')
    .single()

  if (error) {
    // แถวลงไม่ได้ ไฟล์ที่อัปไปแล้วก็ไม่มีใครอ้างถึง — เก็บกวาดทิ้ง
    await admin.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL)
  return NextResponse.json({ attachment: { ...row, url: signed?.signedUrl ?? null } })
}

// ลบรูป — คนที่แนบเอง หรือหมอ/แอดมิน (กันแคชเชียร์ลบรูปของหมอ)
export async function DELETE(request: NextRequest) {
  const staff = await getStaff()
  if (!staff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await request.json()
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('visit_attachments')
    .select('id, path, uploaded_by')
    .eq('id', id)
    .maybeSingle()
  if (!row) return NextResponse.json({ ok: true })

  if (row.uploaded_by !== staff.userId && !canExamine(staff.role)) {
    return NextResponse.json({ error: 'ลบได้เฉพาะรูปที่ตัวเองแนบ' }, { status: 403 })
  }

  const { error } = await admin.from('visit_attachments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.storage.from(BUCKET).remove([row.path])
  return NextResponse.json({ ok: true })
}

// แก้คำอธิบายรูป
export async function PATCH(request: NextRequest) {
  const staff = await getStaff()
  if (!staff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id, caption } = await request.json()
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('visit_attachments')
    .update({ caption: typeof caption === 'string' && caption.trim() ? caption.trim() : null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
