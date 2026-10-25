/**
 * ตรวจสูตร "เงินสดที่ควรมีในลิ้นชัก" กับฐานข้อมูลจริง เน้นเคสบิลที่ถูกยกเลิก
 *
 *   npx tsx scripts/verify-shift-cash.ts
 *
 * สร้างกะทดสอบ (เปิดย้อนหลัง 10 นาที) + บิลทดสอบ ZZCASH-* แล้วยิงตรรกะจริงจาก
 * src/lib/shiftCash.ts ด้วย query ชุดเดียวกับหน้าปิดกะ เทียบกับยอดที่คำนวณด้วยมือ
 * ลบทุกอย่างที่สร้างทิ้งตอนจบ · ข้ามทั้งหมดถ้าร้านมีกะเปิดอยู่
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expectedCash, splitShiftBills, type ShiftBill } from '../src/lib/shiftCash'

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

let passed = 0
let failed = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (ok) passed++
  else failed++
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005

const madeTx: string[] = []
const madeShifts: string[] = []

async function cleanup() {
  for (const id of madeTx) {
    await supabase.from('transaction_payments').delete().eq('transaction_id', id)
    await supabase.from('transactions').delete().eq('id', id)
  }
  for (const id of madeShifts) await supabase.from('shifts').delete().eq('id', id)
}

let seq = 0
async function makeBill(opts: {
  total: number
  method: 'cash' | 'transfer' | 'card'
  minutesAgo: number
  cashier: string
  split?: { method: 'cash' | 'transfer' | 'card'; amount: number }[]
}) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      transaction_number: `ZZCASH-${Date.now()}-${seq++}`,
      cashier_id: opts.cashier,
      subtotal: opts.total,
      total: opts.total,
      payment_method: opts.method,
      sales_channel: 'store',
      created_at: new Date(Date.now() - opts.minutesAgo * 60_000).toISOString(),
      notes: 'ข้อมูลทดสอบ verify-shift-cash (ลบทิ้งทันที)',
    })
    .select('id, created_at')
    .single()
  if (error) throw error
  madeTx.push(data.id)
  for (const line of opts.split ?? []) {
    const { error: e } = await supabase
      .from('transaction_payments')
      .insert({ transaction_id: data.id, method: line.method, amount: line.amount })
    if (e) throw e
  }
  return data
}

async function cancelBill(id: string, refund: 'cash' | 'transfer' | 'credit', minutesAgo: number) {
  const { error } = await supabase
    .from('transactions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      refund_method: refund,
      cancel_reason: 'ทดสอบ',
    })
    .eq('id', id)
  if (error) throw error
}

/** อ่านยอดด้วย query ชุดเดียวกับที่หน้าปิดกะใช้ */
async function readShiftCash(openedAt: string, openingCash: number) {
  const [{ data: sold }, { data: refunds }] = await Promise.all([
    supabase
      .from('transactions')
      .select('status, total, payment_method, transaction_payments(method, amount)')
      .eq('sales_channel', 'store')
      .gte('created_at', openedAt),
    supabase
      .from('transactions')
      .select('total')
      .eq('status', 'cancelled')
      .eq('refund_method', 'cash')
      .gte('cancelled_at', openedAt),
  ])
  const split = splitShiftBills((sold ?? []) as unknown as ShiftBill[])
  const cashRefunds = (refunds ?? []).reduce((s, t) => s + t.total, 0)
  const cashSales = split.byMethod.cash ?? 0
  return {
    ...split,
    cashSales,
    cashRefunds,
    expected: expectedCash({ openingCash, cashSales, cashFromCancelled: split.cashFromCancelled, cashRefunds, cashIn: 0, cashOut: 0 }),
    // สูตรเดิมก่อนแก้ — ไว้โชว์ว่าบั๊กมีจริงและหายไปแล้ว
    old: openingCash + cashSales - cashRefunds,
  }
}

async function main() {
  const { data: openNow } = await supabase.from('shifts').select('id').is('closed_at', null).maybeSingle()
  if (openNow) {
    console.log('⚠️  ร้านมีกะเปิดอยู่ — ไม่แตะข้อมูล ออกก่อน')
    return
  }
  const { data: who } = await supabase.from('profiles').select('id, name').limit(1).single()
  const cashier = who!.id as string

  // กะทดสอบ: เปิดย้อนหลัง 10 นาที (ช่วงที่ร้านไม่มีบิลจริงแล้ว) เงินตั้งต้น ฿1,000
  const openedAt = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data: shift, error: shiftErr } = await supabase
    .from('shifts')
    .insert({ opened_at: openedAt, opened_by: cashier, opening_cash: 1000, notes: 'กะทดสอบ verify-shift-cash' })
    .select('id, opened_at')
    .single()
  if (shiftErr) throw shiftErr
  madeShifts.push(shift.id)

  // ไม่มีบิลจริงค้างในช่วงนี้ ยอดเริ่มต้นต้องเท่าเงินตั้งต้นเป๊ะ
  const base = await readShiftCash(shift.opened_at, 1000)
  check(near(base.expected, 1000), 'ช่วงกะว่าง → เงินที่ควรมี = เงินตั้งต้น ฿1,000', `฿${base.expected.toFixed(2)}`)

  // 1) ขายเงินสด ฿100 (ไม่ยกเลิก)
  await makeBill({ total: 100, method: 'cash', minutesAgo: 9, cashier })
  // 2) ขายเงินสด ฿50 ในกะ แล้วยกเลิกคืนเงินสดในกะ → เข้าแล้วออก สุทธิ 0 (นี่คือเคสที่หักสองเด้ง)
  const b2 = await makeBill({ total: 50, method: 'cash', minutesAgo: 8, cashier })
  await cancelBill(b2.id, 'cash', 7)
  // 3) ขายเงินสด ฿70 ในกะ แล้วยกเลิกคืนเป็นเครดิต → เงินสดยังอยู่ในเก๊ะ
  const b3 = await makeBill({ total: 70, method: 'cash', minutesAgo: 6, cashier })
  await cancelBill(b3.id, 'credit', 5)
  // 4) ขายโอน ฿200 → ไม่เกี่ยวกับเก๊ะ
  await makeBill({ total: 200, method: 'transfer', minutesAgo: 4, cashier })
  // 5) บิลแยกจ่าย เงินสด ฿2 + โอน ฿57 แล้วยกเลิกคืนเงินสดเต็มใบ ฿59 → +2 −59
  const b5 = await makeBill({
    total: 59, method: 'cash', minutesAgo: 3, cashier,
    split: [{ method: 'cash', amount: 2 }, { method: 'transfer', amount: 57 }],
  })
  await cancelBill(b5.id, 'cash', 2)
  // 6) บิลเงินสด ฿30 ที่ขายก่อนเปิดกะ (30 นาทีก่อน) แล้วมายกเลิกคืนเงินสดในกะนี้ → หักอย่างเดียว
  const b6 = await makeBill({ total: 30, method: 'cash', minutesAgo: 30, cashier })
  await cancelBill(b6.id, 'cash', 1)

  const r = await readShiftCash(shift.opened_at, 1000)
  console.log(
    `\nขายเงินสด ฿${r.cashSales.toFixed(2)} · จากบิลที่ยกเลิก ฿${r.cashFromCancelled.toFixed(2)} ` +
    `(${r.cancelledBills} ใบ) · คืนเงินสด ฿${r.cashRefunds.toFixed(2)}\n`,
  )

  check(near(r.cashSales, 100), 'ขายเงินสด = ฿100 (บิลที่ยกเลิกไม่นับเป็นยอดขาย)', `฿${r.cashSales.toFixed(2)}`)
  check(near(r.byMethod.transfer ?? 0, 200), 'ขายโอน = ฿200', `฿${(r.byMethod.transfer ?? 0).toFixed(2)}`)
  check(near(r.cashFromCancelled, 50 + 70 + 2), 'เงินสดจากบิลที่ยกเลิกภายหลัง = ฿122 (50 + 70 + แยกจ่าย 2)', `฿${r.cashFromCancelled.toFixed(2)}`)
  check(r.cancelledBills === 3, 'นับบิลที่ยกเลิกในกะได้ 3 ใบ (บิลก่อนเปิดกะไม่นับ)', String(r.cancelledBills))
  check(near(r.cashRefunds, 50 + 59 + 30), 'คืนเงินสด = ฿139 (50 + 59 + 30)', `฿${r.cashRefunds.toFixed(2)}`)

  // เงินในเก๊ะจริง: 1000 + 100 (ขาย) + 50 − 50 (ขายแล้วคืน) + 70 (ยกเลิกคืนเครดิต เงินสดค้างอยู่)
  //                 + 2 − 59 (แยกจ่ายแล้วคืนเต็มใบ) − 30 (คืนบิลของกะก่อน) = 1083
  const truth = 1000 + 100 + 50 - 50 + 70 + 2 - 59 - 30
  check(near(r.expected, truth), `เงินที่ควรมี = ฿${truth} ตามเงินที่เข้า-ออกเก๊ะจริง`, `฿${r.expected.toFixed(2)}`)
  check(!near(r.old, truth), `สูตรเดิมให้ ฿${r.old.toFixed(2)} (ต่ำไป ฿${(truth - r.old).toFixed(2)}) = บั๊กมีจริง`)

  await cleanup()
  madeTx.length = 0
  madeShifts.length = 0
  const { data: left } = await supabase.from('transactions').select('id').like('transaction_number', 'ZZCASH%')
  const { data: leftShift } = await supabase.from('shifts').select('id').is('closed_at', null)
  check((left ?? []).length === 0 && (leftShift ?? []).length === 0, 'ลบบิล/กะทดสอบหมดแล้ว')

  console.log(`\nผ่าน ${passed} · ไม่ผ่าน ${failed}`)
}

main()
  .catch(async (e) => { console.error(e); await cleanup(); process.exit(1) })
  .then(async () => { await cleanup() })
