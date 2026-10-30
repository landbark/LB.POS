/**
 * ตรวจการแยกช่องทาง หน้าร้าน / ออกบูธ / ออนไลน์ กับฐานข้อมูลจริง โดยไม่แตะข้อมูลของร้าน
 *
 *   npx tsx scripts/verify-sales-channels.ts
 *
 * ยิงตรรกะจริงจาก src/lib/salesChannel.ts (totalsByChannelGroup) ด้วยบิลทั้งเดือนของจริง
 * แล้วเทียบยอดรวมสามกลุ่มกับยอดรวมทั้งตาราง — ถ้าแยกแล้วตัวเลขหายไปจะฟ้องตรงนี้
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHANNEL_LABEL, isOwnMoney, totalsByChannelGroup } from '../src/lib/salesChannel'
import { thaiDayRange, thaiMonthStart } from '../src/lib/thaiDate'
import type { SalesChannel } from '../src/lib/types'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const baht = (n: number) => `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`

let failed = 0
function check(ok: boolean, label: string) {
  console.log(`${ok ? '✅' : '❌'} ${label}`)
  if (!ok) failed++
}

async function main() {
  const startOfMonth = thaiDayRange(thaiMonthStart()).startISO

  const { data: rows, error } = await admin
    .from('transactions')
    .select('total, sales_channel, status')
    .neq('status', 'cancelled')
    .gte('created_at', startOfMonth)
  if (error) throw new Error(error.message)

  const groups = totalsByChannelGroup(rows ?? [])

  console.log(`\nบิลเดือนนี้ที่ไม่ถูกยกเลิก ${rows?.length ?? 0} ใบ\n`)
  for (const g of groups) {
    console.log(`${g.label.padEnd(8)} ${baht(g.amount).padStart(16)} · ${g.count} บิล`)
    for (const c of g.byChannel) {
      console.log(`   • ${CHANNEL_LABEL[c.channel].padEnd(10)} ${baht(c.amount).padStart(16)} · ${c.count} บิล${isOwnMoney(c.channel) ? '' : ' (เงินเข้าแพลตฟอร์ม)'}`)
    }
  }

  const allTotal = (rows ?? []).reduce((s, r) => s + r.total, 0)
  const groupTotal = groups.reduce((s, g) => s + g.amount, 0)
  const groupCount = groups.reduce((s, g) => s + g.count, 0)
  const ownTotal = (rows ?? []).filter((r) => isOwnMoney(r.sales_channel as SalesChannel)).reduce((s, r) => s + r.total, 0)
  const groupOwnTotal = groups.reduce((s, g) => s + g.ownAmount, 0)

  console.log('')
  check(Math.abs(groupTotal - allTotal) < 0.005, `ยอดรวมสามกลุ่มเท่ายอดรวมทั้งเดือน (${baht(groupTotal)})`)
  check(groupCount === (rows?.length ?? 0), `จำนวนบิลสามกลุ่มเท่าของจริง (${groupCount} ใบ)`)
  check(Math.abs(groupOwnTotal - ownTotal) < 0.005, `ยอดเงินที่ร้านรับเองตรงกัน (${baht(groupOwnTotal)})`)
  check(groups.length === 3 && groups.map((g) => g.group).join(',') === 'store,booth,online',
    'คืนครบสามกลุ่มตามลำดับเดิมเสมอ (วันไม่มีบูธการ์ดไม่หาย)')

  // บิลของออเดอร์เว็บต้องเป็นช่องทาง online หลังรัน migration — ถ้ายังเป็น store คือยังไม่ได้รัน
  const { data: webOrders } = await admin
    .from('orders')
    .select('order_number, transactions!inner(sales_channel)')
    .not('transaction_id', 'is', null)
  const stray = (webOrders ?? []).filter(
    (o) => (o.transactions as unknown as { sales_channel: string } | null)?.sales_channel !== 'online'
  )
  if ((webOrders ?? []).length === 0) {
    console.log('ℹ️  ยังไม่มีออเดอร์เว็บที่ยืนยันแล้วในฐานข้อมูล — ข้ามการตรวจ backfill')
  } else {
    check(stray.length === 0, `บิลออเดอร์เว็บเป็นช่องทาง online ครบ (ค้าง ${stray.length} ใบ: ${stray.map((o) => o.order_number).join(', ') || '—'})`)
  }

  console.log(failed === 0 ? '\nผ่านทั้งหมด' : `\nไม่ผ่าน ${failed} ข้อ`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
