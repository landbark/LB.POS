/**
 * สำรองข้อมูลทั้งหมดลงเครื่อง — ตาราง + ไฟล์ใน Storage
 *
 *   npx tsx scripts/backup.ts              เก็บลง ./backups/
 *   npx tsx scripts/backup.ts /path/to/dir เก็บลงที่อื่น (เช่น iCloud/Google Drive)
 *
 * ทำไมต้องมี: Supabase Free plan ไม่มี Point-in-Time Recovery และไม่มี
 * การกู้คืนย้อนหลังแบบกดเองได้ ถ้าข้อมูลหายหรือลบผิด จะไม่มีอะไรให้ย้อนกลับ
 * สคริปต์นี้คือตาข่ายรองที่ควบคุมเองได้ 100%
 *
 * ไฟล์ที่ได้มีข้อมูลลูกค้าทั้งหมด (ชื่อ เบอร์โทร ที่อยู่ ประวัติการซื้อ)
 * เก็บในที่ปลอดภัย อย่าอัปขึ้น git หรือแชร์ลิงก์สาธารณะ
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const BUCKETS = ['product-images', 'store-assets', 'payment-slips']

/** PostgREST คืนสูงสุด 1000 แถวต่อครั้ง ต้องไล่ดึงทีละหน้า */
async function dumpTable(table: string): Promise<unknown[] | null> {
  const rows: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999)
    if (error) return null
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

/** รายชื่อตารางจาก OpenAPI ของ PostgREST — ไม่ต้องมาไล่แก้เองเวลาเพิ่มตาราง */
async function listTables(): Promise<string[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  const spec = (await res.json()) as { paths?: Record<string, unknown> }
  return Object.keys(spec.paths ?? {})
    .filter((p) => p !== '/' && !p.startsWith('/rpc/'))
    .map((p) => p.slice(1))
    .sort()
}

async function downloadBucket(bucket: string, outDir: string): Promise<number> {
  let saved = 0

  const walk = async (prefix: string) => {
    const { data } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 })
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      // id เป็น null แปลว่าเป็นโฟลเดอร์ ไม่ใช่ไฟล์
      if (entry.id === null) { await walk(path); continue }

      const { data: file } = await supabase.storage.from(bucket).download(path)
      if (!file) continue

      const target = join(outDir, bucket, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, Buffer.from(await file.arrayBuffer()))
      saved += 1
    }
  }

  await walk('')
  return saved
}

async function main() {
  const base = process.argv[2] ?? join(ROOT, 'backups')
  const stamp = new Date().toLocaleString('sv', { timeZone: 'Asia/Bangkok' })
    .replace(/[: ]/g, '-').slice(0, 16)
  const outDir = join(base, stamp)
  mkdirSync(outDir, { recursive: true })

  console.log(`สำรองข้อมูลไปที่ ${outDir}\n`)

  const tables = await listTables()
  let totalRows = 0
  const summary: Record<string, number> = {}

  for (const table of tables) {
    const rows = await dumpTable(table)
    if (rows === null) { console.log(`  ${table.padEnd(26)} ข้าม (อ่านไม่ได้)`); continue }
    writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows, null, 2))
    summary[table] = rows.length
    totalRows += rows.length
    if (rows.length > 0) console.log(`  ${table.padEnd(26)} ${String(rows.length).padStart(6)} แถว`)
  }

  console.log(`\n  ${'รวม'.padEnd(26)} ${String(totalRows).padStart(6)} แถว · ${tables.length} ตาราง`)

  console.log('\nไฟล์ใน Storage')
  let totalFiles = 0
  for (const bucket of BUCKETS) {
    const n = await downloadBucket(bucket, outDir)
    totalFiles += n
    console.log(`  ${bucket.padEnd(26)} ${String(n).padStart(6)} ไฟล์`)
  }

  writeFileSync(join(outDir, '_summary.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    project: process.env.NEXT_PUBLIC_SUPABASE_URL,
    tables: summary,
    totalRows,
    totalFiles,
  }, null, 2))

  console.log(`\nเสร็จแล้ว — ${totalRows} แถว · ${totalFiles} ไฟล์`)
  console.log('ไฟล์ชุดนี้มีข้อมูลลูกค้าทั้งหมด เก็บในที่ปลอดภัย อย่าแชร์สาธารณะ')
}

main().catch((err) => { console.error(err); process.exit(1) })
