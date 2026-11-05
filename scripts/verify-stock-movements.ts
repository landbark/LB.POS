/**
 * ตรวจรายงานความเคลื่อนไหวสต็อค + การจับกลุ่มใบตัดสต็อก กับฐานข้อมูลจริง
 *
 *   npx tsx scripts/verify-stock-movements.ts
 *
 * อ่านอย่างเดียว ไม่เขียนอะไรลงฐานข้อมูล — ยิงตรรกะจริงจาก src/lib/stockMovements.ts
 * ด้วยคำสั่งค้นชุดเดียวกับที่หน้า /admin/reports/stock และหน้าเอกสารใช้
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  groupAdjustDocs,
  isStockCountReason,
  IN_TYPES,
  MOVEMENT_LABEL,
  OUT_TYPES,
  type AdjustRow,
} from '../src/lib/stockMovements'
import type { StockMovementType } from '../src/lib/types'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const thaiToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
const dayStart = (d: string) => new Date(`${d}T00:00:00+07:00`).toISOString()
const num = (n: number) => n.toLocaleString('th-TH')

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(error.message)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < 1000) return rows
  }
}

async function main() {
  const from = thaiToday().slice(0, 7) + '-01'
  const to = thaiToday()
  const start = dayStart(from)
  const end = new Date(new Date(dayStart(to)).getTime() + 86_400_000).toISOString()

  console.log(`ช่วงที่ตรวจ: ${from} → ${to}\n`)

  // 1) ยอดรวมแยกประเภท — ต้องตรงกับการ์ดบนหน้ารายงาน
  const moves = await fetchAll<{ type: StockMovementType; quantity: number; product_id: string }>((f, t) =>
    supabase
      .from('stock_movements')
      .select('type, quantity, product_id, products!inner(name, unit)')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('id')
      .range(f, t)
  )

  const byType = {} as Record<StockMovementType, number>
  const products = new Set<string>()
  for (const m of moves) {
    byType[m.type] = (byType[m.type] ?? 0) + m.quantity
    products.add(m.product_id)
  }

  console.log(`แถวทั้งหมด ${num(moves.length)} · สินค้าที่ขยับ ${num(products.size)} ตัว`)
  for (const t of Object.keys(MOVEMENT_LABEL) as StockMovementType[]) {
    console.log(`  ${MOVEMENT_LABEL[t].text.padEnd(14)} ${MOVEMENT_LABEL[t].sign}${num(byType[t] ?? 0)}`)
  }
  const totalIn = IN_TYPES.reduce((s, t) => s + (byType[t] ?? 0), 0)
  const totalOut = OUT_TYPES.reduce((s, t) => s + (byType[t] ?? 0), 0)
  console.log(`  ของเข้ารวม +${num(totalIn)} · ของออกรวม -${num(totalOut)} · สุทธิ ${totalIn - totalOut >= 0 ? '+' : ''}${num(totalIn - totalOut)}`)

  if ((byType.sale ?? 0) === 0) console.log('  ⚠️  เดือนนี้ยังไม่มีการตัดสต็อกจากการขายเลย — ตรวจว่าช่วงวันถูกไหม')
  else console.log('  ✅ การตัดสต็อกจากการขายขึ้นในรายงานแล้ว')

  // 2) ใบตัดสต็อก/ปรับสต็อก — แถวจากการกดครั้งเดียวต้องรวมเป็นใบเดียว
  const { data: adjustments } = await supabase
    .from('stock_movements')
    .select('id, created_at, type, quantity, reason, product_id, products!inner(name, sku, unit), profiles(name)')
    .in('type', ['adjust_in', 'adjust_out'])
    .gte('created_at', new Date(Date.now() - 90 * 86_400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1000)

  const rows = ((adjustments ?? []) as unknown as AdjustRow[]).filter((m) => !isStockCountReason(m.reason))
  const docs = groupAdjustDocs(rows)

  console.log(`\nใบตัดสต็อก/ปรับสต็อก 90 วันล่าสุด: ${num(docs.length)} ใบ จาก ${num(rows.length)} แถว`)
  for (const d of docs.slice(0, 12)) {
    const stamp = new Date(d.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })
    console.log(
      `  ${stamp} · ${MOVEMENT_LABEL[d.type].text} · ${d.rows.length} รายการ · ${MOVEMENT_LABEL[d.type].sign}${num(d.totalQty)}` +
        ` · ${d.byName} · ${d.isWriteoff ? 'ตัดออก' : 'ปรับ'}: ${d.note}` +
        `\n      พิมพ์: /print/stock-adjust/${d.id}`
    )
  }

  // ทุกแถวต้องอยู่ในใบใดใบหนึ่ง ไม่หายและไม่ซ้ำ
  const grouped = docs.reduce((s, d) => s + d.rows.length, 0)
  const ids = new Set(docs.flatMap((d) => d.rows.map((r) => r.id)))
  console.log(
    grouped === rows.length && ids.size === rows.length
      ? '  ✅ ทุกแถวถูกจัดเข้าใบครบ ไม่ซ้ำ ไม่หาย'
      : `  ❌ แถวไม่ครบ: จัดกลุ่มได้ ${grouped} / ไอดีไม่ซ้ำ ${ids.size} จากทั้งหมด ${rows.length}`
  )

  const qtyOk = docs.every((d) => d.totalQty === d.rows.reduce((s, r) => s + r.quantity, 0))
  console.log(qtyOk ? '  ✅ ยอดรวมของทุกใบตรงกับผลบวกรายบรรทัด' : '  ❌ ยอดรวมของบางใบไม่ตรงกับรายบรรทัด')

  const writeoffs = docs.filter((d) => d.isWriteoff)
  console.log(`  ใบที่มาจากปุ่ม "ตัดสต็อกออก" ที่หน้าขาย: ${num(writeoffs.length)} ใบ`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
