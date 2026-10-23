/**
 * ตรวจระบบนับสต็อกกับฐานข้อมูลจริง โดยไม่แตะข้อมูลของร้าน
 *
 *   npx tsx scripts/verify-stock-count.ts
 *
 * สร้างสินค้าทดสอบ (active = false จึงไม่โผล่ในหน้าขาย/เว็บ/หน้านับ) + รอบนับทดสอบ
 * ยิงตรรกะจริงจาก src/lib/stockCount.ts แล้วลบทุกอย่างที่สร้างทิ้งตอนจบ
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyCountDiff, stockOf, summarize, varianceOf } from '../src/lib/stockCount'

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

const TAG = `ZZ-TEST-${Date.now()}`
const made: { products: string[]; counts: string[] } = { products: [], counts: [] }

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed += 1; console.log(`  ✅ ${name}`) }
  else { failed += 1; console.log(`  ❌ ${name} ${detail}`) }
}

async function makeProduct(name: string, lots: { qty: number; expiry: string | null }[]) {
  const { data, error } = await supabase
    .from('products')
    .insert({ name: `${TAG} ${name}`, unit: 'ซอง', price: 100, cost: 60, active: false })
    .select('id')
    .single()
  if (error || !data) throw new Error('สร้างสินค้าทดสอบไม่ได้: ' + error?.message)
  made.products.push(data.id)

  for (const l of lots) {
    await supabase.from('product_lots').insert({
      product_id: data.id, quantity: l.qty, initial_quantity: l.qty, expiry_date: l.expiry,
    })
  }
  return data.id
}

const lotsOf = async (productId: string) => {
  const { data } = await supabase
    .from('product_lots').select('quantity, expiry_date').eq('product_id', productId)
    .order('expiry_date', { ascending: true, nullsFirst: false })
  return data ?? []
}

const movementsOf = async (productId: string) => {
  const { data } = await supabase
    .from('stock_movements').select('type, quantity, reason').eq('product_id', productId)
    .order('created_at')
  return data ?? []
}

async function main() {
  console.log('\n— ตรรกะปรับสต็อกตามผลนับ —')

  // ขาด: ระบบ 10 นับได้ 7
  const short = await makeProduct('ขาด', [{ qty: 10, expiry: null }])
  const r1 = await applyCountDiff(supabase, { productId: short, diff: -3, reason: 'นับสต็อก TEST', createdBy: null })
  const l1 = await lotsOf(short)
  const m1 = await movementsOf(short)
  check('ของขาด 3 → lot เหลือ 7', l1[0]?.quantity === 7, `(ได้ ${l1[0]?.quantity})`)
  check('ลงประวัติ adjust_out 3', m1[0]?.type === 'adjust_out' && m1[0]?.quantity === 3, JSON.stringify(m1[0]))
  check('applied = -3, ไม่มี shortfall', r1.applied === -3 && r1.shortfall === 0, JSON.stringify(r1))

  // เกิน: ระบบ 7 นับได้ 12
  const r2 = await applyCountDiff(supabase, { productId: short, diff: 5, reason: 'นับสต็อก TEST', createdBy: null })
  const l2 = await lotsOf(short)
  const m2 = await movementsOf(short)
  check('ของเกิน 5 → lot เป็น 12', l2[0]?.quantity === 12, `(ได้ ${l2[0]?.quantity})`)
  check('ลงประวัติ adjust_in 5', m2[1]?.type === 'adjust_in' && m2[1]?.quantity === 5, JSON.stringify(m2[1]))
  check('applied = +5', r2.applied === 5, JSON.stringify(r2))

  // ไม่มี lot เลย แต่มีของบนชั้น
  const noLot = await makeProduct('ไม่มีล็อต', [])
  await applyCountDiff(supabase, { productId: noLot, diff: 4, reason: 'นับสต็อก TEST', createdBy: null })
  const l3 = await lotsOf(noLot)
  check('สินค้าไม่มี lot → สร้าง lot ให้และใส่ 4', l3.length === 1 && l3[0].quantity === 4, JSON.stringify(l3))

  // ตัดข้าม lot ตาม FEFO (ใกล้หมดอายุก่อน)
  const fefo = await makeProduct('FEFO', [
    { qty: 3, expiry: '2026-11-30' },
    { qty: 8, expiry: '2027-06-30' },
  ])
  await applyCountDiff(supabase, { productId: fefo, diff: -5, reason: 'นับสต็อก TEST', createdBy: null })
  const l4 = await lotsOf(fefo)
  check('ตัด lot ใกล้หมดอายุก่อนจนหมด แล้วไปต่อ lot ถัดไป',
    l4[0]?.quantity === 0 && l4[1]?.quantity === 6, JSON.stringify(l4))

  // ขายแทรกจนของไม่พอให้ตัด — ต้องหยุดที่ 0 ไม่ติดลบ
  const neg = await makeProduct('ไม่พอตัด', [{ qty: 2, expiry: null }])
  const r5 = await applyCountDiff(supabase, { productId: neg, diff: -5, reason: 'นับสต็อก TEST', createdBy: null })
  const l5 = await lotsOf(neg)
  check('ของไม่พอตัด → หยุดที่ 0 ไม่ติดลบ', l5[0]?.quantity === 0, JSON.stringify(l5))
  check('รายงาน shortfall = 3', r5.applied === -2 && r5.shortfall === 3, JSON.stringify(r5))

  console.log('\n— รอบนับ: บันทึก/นับซ้ำ/สรุป —')

  const { data: round, error: rErr } = await supabase
    .from('stock_counts')
    .insert({ count_number: `SC-TEST-${Date.now()}`, name: `${TAG} รอบทดสอบ` })
    .select('id, count_number, status')
    .single()
  if (rErr || !round) throw new Error('เปิดรอบนับไม่ได้: ' + rErr?.message)
  made.counts.push(round.id)
  check('เปิดรอบนับได้ สถานะเริ่มต้น counting', round.status === 'counting', round.status)

  // นับครั้งแรก แล้วยิงซ้ำตัวเดิม — ต้องทับแถวเดิม ไม่เกิดแถวซ้ำ (ทดสอบ UNIQUE + onConflict ที่หน้าเว็บใช้)
  const upsert = (counted: number) =>
    supabase.from('stock_count_items').upsert(
      { count_id: round.id, product_id: short, counted_quantity: counted, system_quantity: 12, counted_by: null },
      { onConflict: 'count_id,product_id' }
    ).select('id').single()

  const first = await upsert(1)
  const again = await upsert(9)
  check('ยิงซ้ำสินค้าเดิม = แก้แถวเดิม', !again.error && first.data?.id === again.data?.id, again.error?.message ?? '')

  const { count: itemCount } = await supabase
    .from('stock_count_items').select('id', { count: 'exact', head: true }).eq('count_id', round.id)
  check('รอบนี้มีแถวเดียวต่อสินค้า', itemCount === 1, `(ได้ ${itemCount})`)

  check('ส่วนต่าง = นับได้ − ยอดระบบตอนนับ', varianceOf({ counted_quantity: 9, system_quantity: 12 }) === -3)
  const sum = summarize([
    { counted_quantity: 9, system_quantity: 12, cost: 60 },
    { counted_quantity: 5, system_quantity: 5, cost: 60 },
    { counted_quantity: 7, system_quantity: 4, cost: 60 },
  ])
  check('สรุปรอบ: ขาด 1 · เกิน 1 · ตรง 1 · มูลค่าสุทธิ ฿0',
    sum.short === 1 && sum.over === 1 && sum.matched === 1 && sum.netValue === 0, JSON.stringify(sum))

  console.log('\n— คำสั่ง select ที่สองหน้านี้ใช้ —')

  const list = await supabase
    .from('stock_counts')
    .select('*, categories(name), creator:profiles!stock_counts_created_by_fkey(name), stock_count_items(counted_quantity, system_quantity, products(cost))')
    .eq('id', round.id)
    .single()
  check('หน้ารายการรอบนับ (join หมวด + ผู้เปิดรอบ + รายการนับ)', !list.error, list.error?.message ?? '')

  const detail = await supabase
    .from('stock_count_items')
    .select('*, counter:profiles!stock_count_items_counted_by_fkey(name)')
    .eq('count_id', round.id)
  check('หน้านับ (join ผู้นับ)', !detail.error, detail.error?.message ?? '')

  const posted = await supabase
    .from('stock_counts')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', round.id).select('status').single()
  check('ปิดรอบเป็น posted ได้', posted.data?.status === 'posted', posted.error?.message ?? '')

  const badStatus = await supabase.from('stock_counts').update({ status: 'เละ' }).eq('id', round.id)
  check('สถานะนอกเหนือจากที่กำหนด ถูก DB ปฏิเสธ', !!badStatus.error)

  console.log('\n— ของจริงในร้านยังไม่ถูกแตะ —')
  const { count: realItems } = await supabase
    .from('stock_count_items').select('id', { count: 'exact', head: true }).neq('count_id', round.id)
  check('ไม่มีรายการนับของรอบอื่นเกิดขึ้น', realItems === 0, `(ได้ ${realItems})`)
  check('stockOf รวมยอดทุก lot', stockOf({ product_lots: [{ quantity: 3 }, { quantity: 4 }] }) === 7)
}

async function cleanup() {
  for (const id of made.counts) await supabase.from('stock_counts').delete().eq('id', id)
  // ลบสินค้าทดสอบ → lot กับ stock_movements ของมันถูกลบตาม (ON DELETE CASCADE)
  for (const id of made.products) await supabase.from('products').delete().eq('id', id)

  const { count: leftProducts } = await supabase
    .from('products').select('id', { count: 'exact', head: true }).ilike('name', `${TAG}%`)
  const { count: leftCounts } = await supabase
    .from('stock_counts').select('id', { count: 'exact', head: true }).ilike('name', `${TAG}%`)
  console.log(`\nเก็บกวาด: เหลือสินค้าทดสอบ ${leftProducts} · รอบทดสอบ ${leftCounts} (ต้องเป็น 0 ทั้งคู่)`)
}

main()
  .catch((err) => { failed += 1; console.error('\n💥', err.message) })
  .finally(async () => {
    await cleanup()
    console.log(`\nผ่าน ${passed} · ไม่ผ่าน ${failed}\n`)
    process.exit(failed === 0 ? 0 : 1)
  })
