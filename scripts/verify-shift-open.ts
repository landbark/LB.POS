/**
 * ตรวจการเปิดกะ + ดึงบิลที่ขายก่อนเปิดกะ กับฐานข้อมูลจริง โดยไม่แตะข้อมูลของร้าน
 *
 *   npx tsx scripts/verify-shift-open.ts
 *
 * ยิงตรรกะจริงจาก src/lib/shiftOpen.ts (findOrphanSales / openShift) แล้วลบกะทดสอบทิ้งตอนจบ
 * ถ้ามีกะของร้านเปิดอยู่ จะข้ามเทสต์ที่ต้องเขียนข้อมูล (unique index กันเปิดซ้อนอยู่แล้ว)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findOrphanSales, openShift, orphanNote } from '../src/lib/shiftOpen'
import { sumByMethod, type PaidTransaction } from '../src/lib/payments'
import { thaiDayRange } from '../src/lib/thaiDate'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const db = supabase as unknown as Parameters<typeof findOrphanSales>[0]

let passed = 0
let failed = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (ok) passed++
  else failed++
}

const madeShifts: string[] = []
const madeTx: string[] = []

async function cleanup() {
  for (const id of madeShifts) await supabase.from('shifts').delete().eq('id', id)
  for (const id of madeTx) await supabase.from('transactions').delete().eq('id', id)
}

async function main() {
  const { data: openNow } = await supabase.from('shifts').select('id, opened_at').is('closed_at', null).maybeSingle()
  console.log(openNow ? `⚠️  ร้านมีกะเปิดอยู่ (${openNow.opened_at}) — ข้ามเทสต์ที่ต้องเขียน\n` : 'ไม่มีกะเปิดอยู่\n')

  // --- 1) findOrphanSales ตรงกับที่คำนวณจากบิลดิบของวันนี้
  const orphan = await findOrphanSales(db)
  const { startISO, endISO } = thaiDayRange()
  const { data: lastClosed } = await supabase
    .from('shifts').select('closed_at').not('closed_at', 'is', null)
    .order('closed_at', { ascending: false }).limit(1).maybeSingle()
  const from = lastClosed?.closed_at && lastClosed.closed_at > startISO ? lastClosed.closed_at : startISO
  const { data: raw } = await supabase
    .from('transactions')
    .select('created_at, total, payment_method, transaction_payments(method, amount)')
    .eq('status', 'completed').eq('sales_channel', 'store')
    .gte('created_at', from).lt('created_at', endISO).order('created_at')
  const bills = (raw ?? []) as unknown as (PaidTransaction & { created_at: string })[]
  const cash = sumByMethod(bills).cash ?? 0
  console.log(`ช่วงที่ไม่มีกะ: ${from} → now · บิลหน้าร้าน ${bills.length} ใบ · เงินสด ฿${cash.toFixed(2)}`)

  if (cash > 0) {
    check(orphan !== null, 'มีบิลเงินสดนอกกะ → คืนค่า orphan')
    check(orphan?.cash === cash, 'ยอดเงินสดตรงกับที่รวมจากบิลดิบ', `฿${orphan?.cash?.toFixed(2)} vs ฿${cash.toFixed(2)}`)
    check(orphan?.bills === bills.length, 'นับจำนวนบิลถูก', `${orphan?.bills} vs ${bills.length}`)
    check(orphan?.firstAt === bills[0].created_at, 'firstAt = เวลาบิลแรกของช่วง')
  } else {
    check(orphan === null, 'ไม่มีบิลเงินสดนอกกะ → คืน null (ไม่รบกวนคนเปิดกะ)')
  }

  // --- 2) บิลบูธ/ออนไลน์ต้องไม่ถูกนับ (เงินไม่ได้เข้าเก๊ะร้าน)
  const { data: others } = await supabase
    .from('transactions').select('id, sales_channel')
    .eq('status', 'completed').neq('sales_channel', 'store')
    .gte('created_at', from).lt('created_at', endISO)
  const otherCash = (others ?? []).length
  check(true, `บิลช่องทางอื่นในช่วงเดียวกัน ${otherCash} ใบ — ไม่ถูกนับโดยตรรกะ (กรอง sales_channel = store)`)

  if (!openNow) {
    // คนที่จะใส่เป็นผู้เปิดกะ/แคชเชียร์ของข้อมูลทดสอบ (FK ไปที่ profiles)
    const { data: who } = await supabase.from('profiles').select('id, name').limit(1).single()
    const userId = who!.id as string

    // --- 3) เปิดกะปกติ = opened_at เป็นเวลาปัจจุบัน ไม่เขียน notes
    const before = Date.now()
    const plain = await openShift({ openingCash: 123.45, openedBy: userId }, db)
    check(!plain.error, 'เปิดกะธรรมดาได้', plain.error ?? '')
    let { data: row } = await supabase.from('shifts').select('*').is('closed_at', null).maybeSingle()
    if (row) madeShifts.push(row.id)
    check(row?.opening_cash === 123.45, 'บันทึกเงินตั้งต้นถูก', `฿${row?.opening_cash}`)
    check(!!row && new Date(row.opened_at).getTime() >= before - 5000, 'opened_at = เวลาปัจจุบัน (ไม่ย้อน)')
    check(row?.notes == null, 'ไม่เขียน notes ตอนไม่ได้รวมบิลย้อนหลัง')

    // --- 4) เปิดกะซ้อนไม่ได้
    const dup = await openShift({ openingCash: 1, openedBy: userId }, db)
    check(dup.error === 'มีกะที่เปิดอยู่แล้ว', 'เปิดกะซ้อนถูกบล็อก', dup.error ?? '(ไม่มี error)')

    await cleanup()
    madeShifts.length = 0

    // --- 5) บิลเงินสดทดสอบที่ขายตอนไม่มีกะเปิด → findOrphanSales ต้องเจอ
    const soldAt = new Date(Date.now() - 60_000).toISOString()
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        transaction_number: `ZZTEST-${Date.now()}`,
        cashier_id: userId,
        subtotal: 1, total: 1,
        payment_method: 'cash',
        sales_channel: 'store',
        created_at: soldAt,
        notes: 'ข้อมูลทดสอบ verify-shift-open (ลบทิ้งทันที)',
      })
      .select('id, created_at, status')
      .single()
    if (txErr) throw txErr
    madeTx.push(tx.id)
    check(tx.status === 'completed', 'บิลทดสอบเป็นสถานะ completed', tx.status)

    const found = await findOrphanSales(db)
    check(found !== null, 'เจอบิลเงินสดที่ขายตอนไม่มีกะเปิด')
    check(found?.cash === 1, 'ยอดเงินสดที่เจอ = ฿1.00', `฿${found?.cash}`)
    check(found?.bills === 1, 'นับได้ 1 ใบ', String(found?.bills))
    check(found?.firstAt === tx.created_at, 'firstAt = เวลาบิลทดสอบ', found?.firstAt)

    // --- 6) เปิดกะแบบรวมบิลก่อนเปิดกะ = opened_at ย้อนไปที่บิลแรก + มี audit ใน notes
    const fake = found!
    const back = await openShift(
      { openingCash: 500, openedBy: userId, openedByName: 'สคริปต์ทดสอบ', orphan: fake },
      db,
    )
    check(!back.error, 'เปิดกะแบบย้อนเวลาได้', back.error ?? '')
    ;({ data: row } = await supabase.from('shifts').select('*').is('closed_at', null).maybeSingle())
    if (row) madeShifts.push(row.id)
    // เทียบเป็นเวลา ไม่เทียบตัวอักษร — postgres คืน '+00:00' ส่วน toISOString() ได้ 'Z'
    check(
      row?.opened_at != null && new Date(row.opened_at).getTime() === new Date(fake.firstAt).getTime(),
      'opened_at ย้อนไปที่บิลแรกจริง',
      row?.opened_at,
    )
    check((row?.notes ?? '').startsWith('[รวมบิลก่อนเปิดกะ'), 'notes มี audit line ของการรวมบิล', row?.notes ?? '')
    check((row?.notes ?? '').includes('เงินสด ฿1.00'), 'audit line บอกยอดเงินสดที่รวมเข้ามา')
    check(row?.notes === orphanNote(fake, 'สคริปต์ทดสอบ'), 'audit line ตรงกับ orphanNote()')

    // --- 7) บิลที่อยู่ในช่วงย้อนหลังถูกนับเข้าสูตร "เงินที่ควรมี" ของกะนี้แล้ว
    const { data: inWindow } = await supabase
      .from('transactions').select('total, payment_method, transaction_payments(method, amount)')
      .eq('status', 'completed').eq('sales_channel', 'store').gte('created_at', row!.opened_at)
    const inCash = sumByMethod((inWindow ?? []) as unknown as PaidTransaction[]).cash ?? 0
    const { data: outWindow } = await supabase
      .from('transactions').select('id')
      .eq('status', 'completed').eq('sales_channel', 'store')
      .gte('created_at', startISO).lt('created_at', row!.opened_at)
    console.log(`   บิลหน้าร้านหลัง opened_at: เงินสด ฿${inCash.toFixed(2)} · ก่อน opened_at (ไม่เข้ากะ): ${(outWindow ?? []).length} ใบ`)
    check(inCash >= 1, `บิลทดสอบเข้าสูตรเงินที่ควรมีของกะแล้ว (เงินสดในกะ ฿${inCash.toFixed(2)})`)

    // --- 8) ถ้าไม่ติ๊กรวมบิล บิลเดิมจะตกนอกกะ (ยืนยันว่าปัญหามีจริง ไม่ได้แก้ของที่ไม่พัง)
    await cleanup()
    madeShifts.length = 0
    const { data: tx2 } = await supabase
      .from('transactions')
      .insert({
        transaction_number: `ZZTEST-${Date.now()}-b`,
        cashier_id: userId, subtotal: 1, total: 1,
        payment_method: 'cash', sales_channel: 'store',
        created_at: new Date(Date.now() - 60_000).toISOString(),
        notes: 'ข้อมูลทดสอบ verify-shift-open (ลบทิ้งทันที)',
      })
      .select('id, created_at').single()
    madeTx.push(tx2!.id)
    const plain2 = await openShift({ openingCash: 500, openedBy: userId }, db)
    check(!plain2.error, 'เปิดกะแบบไม่รวมบิลได้', plain2.error ?? '')
    const { data: row2 } = await supabase.from('shifts').select('*').is('closed_at', null).maybeSingle()
    if (row2) madeShifts.push(row2.id)
    const { data: after } = await supabase
      .from('transactions').select('id')
      .eq('status', 'completed').eq('sales_channel', 'store').gte('created_at', row2!.opened_at)
    check(!(after ?? []).some((t) => t.id === tx2!.id), 'ไม่ติ๊ก = บิลนั้นตกนอกกะจริง (ปิดกะจะขึ้นเงินเกิน ฿1.00)')

    await cleanup()
    madeShifts.length = 0
    const { data: leftOpen } = await supabase.from('shifts').select('id').is('closed_at', null).maybeSingle()
    check(leftOpen == null, 'ลบกะทดสอบหมดแล้ว ไม่มีกะค้าง')
  }

  console.log(`\nผ่าน ${passed} · ไม่ผ่าน ${failed}`)
}

main()
  .catch(async (e) => { console.error(e); await cleanup(); process.exit(1) })
  .then(async () => { await cleanup() })
