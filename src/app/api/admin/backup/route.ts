import { NextResponse, type NextRequest } from 'next/server'
import JSZip from 'jszip'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdmin } from '@/lib/require-staff'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * ดาวน์โหลดข้อมูลทั้งร้านเป็นไฟล์ zip — ปุ่มสำรองข้อมูลในหน้าตั้งค่า
 *
 * Supabase Free plan ไม่มี Point-in-Time Recovery และกู้คืนย้อนหลังเองไม่ได้
 * ปุ่มนี้คือตาข่ายรองที่เจ้าของร้านกดเองได้ทุกเมื่อ
 *
 * ไฟล์ที่ได้มีข้อมูลลูกค้าทั้งหมด จึงจำกัดเฉพาะแอดมิน และจำกัดจำนวนครั้ง
 * (ดึงทั้งฐานข้อมูลทีละครั้งกินทรัพยากรมาก และไม่ควรมีใครต้องกดถี่กว่านี้)
 */

// ดึง 39 ตารางใช้เวลาราว 5 วินาที — เผื่อไว้กันหลุดตอนข้อมูลโตขึ้น
export const maxDuration = 60

const BUCKETS = ['product-images', 'store-assets', 'payment-slips']
const PAGE = 1000

type Supa = ReturnType<typeof createAdminClient>

/** รายชื่อตารางจาก OpenAPI ของ PostgREST — เพิ่มตารางใหม่แล้วไม่ต้องกลับมาแก้ */
async function listTables(): Promise<string[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  const spec = (await res.json()) as { paths?: Record<string, unknown> }
  return Object.keys(spec.paths ?? {})
    .filter((p) => p !== '/' && !p.startsWith('/rpc/'))
    .map((p) => p.slice(1))
    .sort()
}

/** PostgREST คืนสูงสุด 1000 แถวต่อครั้ง ต้องไล่ทีละหน้า */
async function dumpTable(admin: Supa, table: string): Promise<unknown[] | null> {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select('*').range(from, from + PAGE - 1)
    if (error) return null
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

async function addBucket(admin: Supa, zip: JSZip, bucket: string): Promise<number> {
  let saved = 0

  const walk = async (prefix: string) => {
    const { data } = await admin.storage.from(bucket).list(prefix, { limit: PAGE })
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      // id เป็น null แปลว่าเป็นโฟลเดอร์
      if (entry.id === null) { await walk(path); continue }

      const { data: file } = await admin.storage.from(bucket).download(path)
      if (!file) continue
      zip.file(`storage/${bucket}/${path}`, await file.arrayBuffer())
      saved += 1
    }
  }

  await walk('')
  return saved
}

export async function GET(request: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const limited = await rateLimit(`backup:${clientIp(request)}`, { limit: 5, windowMs: 60 * 60_000 })
  if (!limited.ok) {
    return NextResponse.json(
      { error: `สำรองข้อมูลถี่เกินไป ลองใหม่ในอีก ${Math.ceil(limited.retryAfterSeconds / 60)} นาที` },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }

  const db = createAdminClient()
  const zip = new JSZip()
  const tables = await listTables()
  const summary: Record<string, number> = {}
  let totalRows = 0

  // ดึงพร้อมกันทีละ 8 ตาราง — เร็วกว่าไล่ทีละตัวมาก แต่ไม่ถล่ม connection pool
  for (let i = 0; i < tables.length; i += 8) {
    await Promise.all(tables.slice(i, i + 8).map(async (table) => {
      const rows = await dumpTable(db, table)
      if (rows === null) return
      zip.file(`tables/${table}.json`, JSON.stringify(rows, null, 2))
      summary[table] = rows.length
      totalRows += rows.length
    }))
  }

  let totalFiles = 0
  for (const bucket of BUCKETS) totalFiles += await addBucket(db, zip, bucket)

  const createdAt = new Date().toISOString()
  zip.file('_summary.json', JSON.stringify({
    createdAt,
    createdBy: admin.name,
    project: process.env.NEXT_PUBLIC_SUPABASE_URL,
    tables: summary,
    totalRows,
    totalFiles,
  }, null, 2))

  zip.file('อ่านก่อน.txt', [
    'ข้อมูลสำรองของ LANDBARK POS',
    `สร้างเมื่อ ${new Date(createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    `โดย ${admin.name ?? '-'}`,
    '',
    `tables/   ข้อมูลทุกตารางเป็นไฟล์ JSON (${totalRows} แถว)`,
    `storage/  รูปสินค้า โลโก้ และสลิปโอนเงิน (${totalFiles} ไฟล์)`,
    '',
    'ไฟล์ชุดนี้มีชื่อ เบอร์โทร ที่อยู่ และประวัติการซื้อของลูกค้าทุกคน',
    'เก็บในที่ปลอดภัย อย่าส่งต่อหรือแชร์ลิงก์สาธารณะ',
  ].join('\n'))

  const blob = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const stamp = new Date().toLocaleString('sv', { timeZone: 'Asia/Bangkok' })
    .replace(/[: ]/g, '-').slice(0, 16)

  return new NextResponse(blob as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="landbark-backup-${stamp}.zip"`,
      'Content-Length': String(blob.byteLength),
      'X-Backup-Rows': String(totalRows),
      'X-Backup-Files': String(totalFiles),
      'Cache-Control': 'no-store',
    },
  })
}
