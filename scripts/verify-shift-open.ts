/**
 * ตรวจการเปิดกะ + ดึงบิลที่ขายก่อนเปิดกะ + ยอดยกมาจากกะที่แล้ว กับฐานข้อมูลจริง โดยไม่แตะข้อมูลของร้าน
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
import { carryNote, denomDiffs, findCarryOver, findOrphanSales, openShift, orphanNote } from '../src/lib/shiftOpen'
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

    // --- 9) ยอดยกมาจากกะที่แล้ว = ที่นับได้ตอนปิด − ที่แยกให้เจ้าของ และส่วนต่างต้องถูกจดไว้
    // กะทดสอบนี้ปิดแล้ว (closed_at = เมื่อกี้) จึงกลายเป็นกะล่าสุดที่ findCarryOver มองเห็น
    const { data: closedShift } = await supabase
      .from('shifts')
      .insert({
        opened_at: new Date(Date.now() - 2 * 60_000).toISOString(),
        opened_by: userId, opening_cash: 100,
        closed_at: new Date(Date.now() - 60_000).toISOString(), closed_by: userId,
        expected_cash: 1000, closing_cash_counted: 1000, cash_difference: 0,
        // ฿1,000 = 500×1 + 100×3 + 20×5 + 10×8 + 5×4 · แยกให้เจ้าของ 100×3 → ยกมา ฿700
        closing_denominations: { 500: 1, 100: 3, 20: 5, 10: 8, 5: 4 },
        cash_to_owner: 300, owner_denominations: { 100: 3 },
        notes: 'กะทดสอบ verify-shift-open',
      })
      .select('id').single()
    madeShifts.push(closedShift!.id)

    // คอลัมน์ใบนับเปิดกะมาจาก supabase-migration-shift-open-denoms.sql — ยังไม่รันก็เทสต์ที่เหลือได้
    const { error: denomCol } = await supabase.from('shifts').select('opening_denominations').limit(1)
    const hasOpenDenoms = !denomCol
    if (!hasOpenDenoms) console.log('⚠️  ยังไม่ได้รัน migration ใบนับเปิดกะ — ข้ามเทสต์ส่วนนั้น\n')

    const carry = await findCarryOver(db)
    check(carry?.amount === 700, 'ยอดยกมา = นับได้ ฿1,000 − แยกให้เจ้าของ ฿300 = ฿700', `฿${carry?.amount}`)
    check(carry?.counted === 1000 && carry?.toOwner === 300, 'คืนที่มาของยอดมาด้วย (ไว้โชว์ให้คนเปิดกะเห็น)')
    check(
      carry?.denoms?.[500] === 1 && carry?.denoms?.[100] === 0 && carry?.denoms?.[10] === 8,
      'ใบนับที่ยกมา = ที่นับตอนปิด − ที่แยกให้เจ้าของ (แบงค์ร้อย 3−3 = 0)',
      JSON.stringify(carry?.denoms),
    )

    // นับได้เท่ายอดยกมา → ไม่ต้องจดอะไร
    const same = await openShift({ openingCash: 700, openedBy: userId, openedByName: 'สคริปต์ทดสอบ', carry }, db)
    check(!same.error, 'เปิดกะด้วยยอดยกมาได้', same.error ?? '')
    let { data: sameRow } = await supabase.from('shifts').select('*').is('closed_at', null).maybeSingle()
    if (sameRow) madeShifts.push(sameRow.id)
    check(sameRow?.notes == null, 'นับได้ตรงยอดยกมา → ไม่เขียน notes')
    await supabase.from('shifts').delete().eq('id', sameRow!.id)

    // นับได้เกินยอดยกมา 15 (เคสจริง 2026-10-28) → ต้องเขียนไว้ ไม่ให้หายเงียบ
    // เช้านี้นับแยกใบได้ เหรียญสิบ 9 (เมื่อคืน 8) · เหรียญห้า 5 (เมื่อคืน 4) = เกิน ฿15
    const morning = { 1000: 0, 500: 1, 100: 0, 50: 0, 20: 5, 10: 9, 5: 5, 2: 0, 1: 0 }
    const d = denomDiffs(carry!, morning)
    check(
      d.length === 2 && d[0].value === 10 && d[0].was === 8 && d[0].now === 9 && d[1].value === 5,
      'ชี้ได้ว่ากองไหนไม่ตรง — เหรียญสิบ 8→9 · เหรียญห้า 4→5 (ไม่ใช่รู้แค่ว่าต่าง ฿15)',
      d.map((x) => `${x.label} ${x.was}→${x.now}`).join(' · '),
    )
    const off = await openShift(
      {
        openingCash: 715, openedBy: userId, openedByName: 'สคริปต์ทดสอบ', carry,
        carryReason: 'เมื่อคืนนับเหรียญขาด', openingDenoms: hasOpenDenoms ? morning : null,
      },
      db,
    )
    check(!off.error, 'เปิดกะด้วยยอดที่นับได้จริงได้ แม้ไม่ตรงยอดยกมา', off.error ?? '')
    ;({ data: sameRow } = await supabase.from('shifts').select('*').is('closed_at', null).maybeSingle())
    if (sameRow) madeShifts.push(sameRow.id)
    check(sameRow?.opening_cash === 715, 'ใช้ยอดที่นับได้จริงเป็นเงินตั้งต้น (ไม่ทับด้วยยอดยกมา)', `฿${sameRow?.opening_cash}`)
    check((sameRow?.notes ?? '').startsWith('[เงินตั้งต้นไม่ตรงยอดยกมา'), 'เขียน audit line ส่วนต่างลง notes', sameRow?.notes ?? '')
    check((sameRow?.notes ?? '').includes('เกิน ฿15.00'), 'audit line บอกว่าเกินเท่าไหร่')
    check((sameRow?.notes ?? '').includes('เมื่อคืนนับเหรียญขาด'), 'audit line เก็บเหตุผลที่คนเปิดกะกรอก')
    check(
      sameRow?.notes === carryNote(carry!, 715, 'สคริปต์ทดสอบ', 'เมื่อคืนนับเหรียญขาด', hasOpenDenoms ? morning : null),
      'audit line ตรงกับ carryNote()',
    )
    if (hasOpenDenoms) {
      check((sameRow?.notes ?? '').includes('เหรียญสิบ 8→9'), 'audit line บอกกองที่ไม่ตรงไว้ด้วย', sameRow?.notes ?? '')
      check(
        (sameRow?.opening_denominations as Record<string, number> | null)?.['10'] === 9,
        'เก็บใบนับตอนเปิดกะไว้ในฐานข้อมูล',
        JSON.stringify(sameRow?.opening_denominations),
      )
    }

    // --- 10) เจ้าของมาจัดเงินทอนหลังปิดกะ → ยอดยกมาต้องคิดจากใบนับหลังจัด ไม่ใช่ตอนปิด
    const { error: carryCol } = await supabase.from('shifts').select('carry_denominations').limit(1)
    if (carryCol) {
      console.log('⚠️  ยังไม่ได้รัน migration จัดเงินทอนหลังปิดกะ — ข้ามเทสต์ส่วนนั้น')
    } else {
      // แลกแบงค์ร้อย 0 ใบเป็นยี่สิบเพิ่ม 5 ใบ + เติมเหรียญห้าอีก 10 → ฿700 เป็น ฿850
      await supabase
        .from('shifts')
        .update({
          carry_denominations: { 500: 1, 20: 10, 10: 8, 5: 14 },
          carry_adjusted_at: new Date().toISOString(),
          carry_adjusted_by: userId,
        })
        .eq('id', closedShift!.id)
      const after = await findCarryOver(db)
      check(after?.amount === 850, 'ยอดยกมาคิดจากใบนับหลังเจ้าของจัด ไม่ใช่ที่เหลือตอนปิดกะ (฿700 → ฿850)', `฿${after?.amount}`)
      check(after?.denoms?.[20] === 10 && after?.denoms?.[5] === 14, 'ใบนับที่ยกมาเป็นของหลังจัด', JSON.stringify(after?.denoms))
      check(after?.counted === 1000 && after?.toOwner === 300, 'ใบนับของพนักงานตอนปิดกะไม่ถูกแก้', `นับได้ ฿${after?.counted}`)
      check(after?.adjustedAt != null, 'รู้ว่าจัดเมื่อไหร่ (ไว้บอกคนเปิดกะว่าทำไมยอดยกมาไม่เท่าตอนปิด)')

      // เช้ามานับได้ตรงกับที่เจ้าของจัดไว้ → ต้องไม่ขึ้นว่ากองไหนไม่ตรง
      const asLeft = { 1000: 0, 500: 1, 100: 0, 50: 0, 20: 10, 10: 8, 5: 14, 2: 0, 1: 0 }
      check(denomDiffs(after!, asLeft).length === 0, 'นับเช้าได้ตรงกับที่เจ้าของจัดไว้ → ไม่ขึ้นว่ากองไม่ตรง')
    }

    // คอลัมน์ยังไม่มี (deploy ขึ้นก่อนรัน SQL) ก็ต้องเปิดกะได้ ไม่งั้นเช้ามาขายไม่ได้ทั้งวัน
    if (!hasOpenDenoms) {
      await supabase.from('shifts').delete().eq('id', sameRow!.id)
      const fallback = await openShift({ openingCash: 715, openedBy: userId, carry, openingDenoms: morning }, db)
      const { data: fbRow } = await supabase.from('shifts').select('*').is('closed_at', null).maybeSingle()
      if (fbRow) madeShifts.push(fbRow.id)
      check(!fallback.error && fbRow?.opening_cash === 715, 'ยังไม่ได้รัน migration ก็เปิดกะได้ (ตัดใบนับทิ้งแทนที่จะพัง)', fallback.error ?? '')
      sameRow = fbRow
    }

    // เปิดกะแบบใส่ยอดรวมอย่างเดียวยังทำได้ ไม่บังคับให้นับแยก
    await supabase.from('shifts').delete().eq('id', sameRow!.id)
    await openShift({ openingCash: 700, openedBy: userId, carry }, db)
    const { data: plainRow } = await supabase.from('shifts').select('*').is('closed_at', null).maybeSingle()
    if (plainRow) madeShifts.push(plainRow.id)
    check(plainRow?.opening_denominations == null, 'ไม่นับแยกก็เปิดกะได้ ไม่เขียน opening_denominations')

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
