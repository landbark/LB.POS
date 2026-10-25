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
import { applyCountDiff, canStampExpiry, lotsWithStock, stockOf, summarize, varianceOf } from '../src/lib/stockCount'

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

const lotIdsOf = async (productId: string) => {
  const { data } = await supabase
    .from('product_lots').select('id, expiry_date').eq('product_id', productId)
    .order('expiry_date', { ascending: true, nullsFirst: false })
  return (data ?? []).map((l) => l.id)
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

  // ของจริงในร้านมีรอบนับที่ใช้งานแล้ว — จดไว้ก่อนเพื่อเช็กตอนจบว่าสคริปต์ไม่ไปแตะ
  const { count: baselineItems } = await supabase
    .from('stock_count_items').select('id', { count: 'exact', head: true })

  const { data: round, error: rErr } = await supabase
    .from('stock_counts')
    .insert({ count_number: `SC-TEST-${Date.now()}`, name: `${TAG} รอบทดสอบ` })
    .select('id, count_number, status')
    .single()
  if (rErr || !round) throw new Error('เปิดรอบนับไม่ได้: ' + rErr?.message)
  made.counts.push(round.id)
  check('เปิดรอบนับได้ สถานะเริ่มต้น counting', round.status === 'counting', round.status)

  // นับครั้งแรกแล้วยิงซ้ำตัวเดิม — หน้าเว็บหาแถวเดิมแล้ว update ไม่ใช่ insert ใหม่
  const addItem = (counted: number, lot: string | null = null) =>
    supabase.from('stock_count_items')
      .insert({ count_id: round.id, product_id: short, product_lot_id: lot, counted_quantity: counted, system_quantity: 12, counted_by: null })
      .select('id').single()

  const first = await addItem(1)
  const again = await supabase.from('stock_count_items')
    .update({ counted_quantity: 9 }).eq('id', first.data!.id).select('id').single()
  check('ยิงซ้ำสินค้าเดิม = แก้แถวเดิม', !again.error && first.data?.id === again.data?.id, again.error?.message ?? '')

  const dup = await addItem(5)
  check('แถว "นับรวมทุก lot" ซ้ำของสินค้าเดิม ถูก DB ปฏิเสธ', !!dup.error, dup.error?.message ?? 'ไม่ error')

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

  console.log('\n— นับแยก lot —')

  const twoLots = await makeProduct('สองล็อต', [
    { qty: 5, expiry: '2026-12-31' },
    { qty: 9, expiry: '2027-12-31' },
  ])
  const [lotNear, lotFar] = await lotIdsOf(twoLots)

  // นับแยก lot ที่ไกลหมดอายุ ขาด 2 → lot ใกล้หมดอายุต้องไม่ถูกแตะ (ต่างจาก FEFO)
  const rl1 = await applyCountDiff(supabase, { productId: twoLots, lotId: lotFar, diff: -2, reason: 'นับสต็อก TEST', createdBy: null })
  const ll1 = await lotsOf(twoLots)
  check('นับแยก lot → ส่วนต่างลงที่ lot นั้น ไม่ไล่ FEFO',
    ll1[0]?.quantity === 5 && ll1[1]?.quantity === 7, JSON.stringify(ll1))
  check('applied = -2 ไม่มี shortfall', rl1.applied === -2 && rl1.shortfall === 0, JSON.stringify(rl1))

  // ของใน lot ไม่พอให้ตัด — หยุดที่ 0 ไม่ไปกิน lot อื่น
  const rl2 = await applyCountDiff(supabase, { productId: twoLots, lotId: lotNear, diff: -8, reason: 'นับสต็อก TEST', createdBy: null })
  const ll2 = await lotsOf(twoLots)
  check('lot ไม่พอตัด → หยุดที่ 0 ไม่ไปกิน lot อื่น',
    ll2[0]?.quantity === 0 && ll2[1]?.quantity === 7, JSON.stringify(ll2))
  check('รายงาน shortfall = 3', rl2.applied === -5 && rl2.shortfall === 3, JSON.stringify(rl2))

  // lot ถูกลบหลังนับแต่ก่อนกดยืนยัน
  const ghost = await applyCountDiff(supabase, {
    productId: twoLots, lotId: '00000000-0000-0000-0000-000000000001', diff: -3, reason: 'นับสต็อก TEST', createdBy: null,
  })
  check('lot หายไปก่อนกดยืนยัน → ไม่ปรับอะไร', ghost.applied === 0 && ghost.shortfall === 0, JSON.stringify(ghost))

  const roundLots = await supabase.from('stock_count_items').insert([
    { count_id: round.id, product_id: twoLots, product_lot_id: lotNear, counted_quantity: 0, system_quantity: 5, counted_by: null },
    { count_id: round.id, product_id: twoLots, product_lot_id: lotFar, counted_quantity: 7, system_quantity: 9, counted_by: null },
  ]).select('id')
  check('สินค้าเดียวนับได้หลาย lot ในรอบเดียว', !roundLots.error && roundLots.data?.length === 2, roundLots.error?.message ?? '')

  const dupLot = await supabase.from('stock_count_items')
    .insert({ count_id: round.id, product_id: twoLots, product_lot_id: lotNear, counted_quantity: 1, system_quantity: 5, counted_by: null })
  check('lot เดิมซ้ำในรอบเดิม ถูก DB ปฏิเสธ', !!dupLot.error, dupLot.error?.message ?? 'ไม่ error')

  console.log('\n— วันหมดอายุที่อ่านจากกล่องตอนนับ —')

  // lot เดียว ไม่มีวันหมดอายุ — นับตรง (diff 0) แต่กรอกวันหมดอายุมา
  const stamp = await makeProduct('เขียนวันหมดอายุ', [{ qty: 6, expiry: null }])
  const rs1 = await applyCountDiff(supabase, {
    productId: stamp, diff: 0, expiryDate: '2027-03-15', reason: 'นับสต็อก TEST', createdBy: null,
  })
  const ls1 = await lotsOf(stamp)
  check('นับตรงแต่กรอกวันหมดอายุ → เขียนลง lot ให้', ls1[0]?.expiry_date === '2027-03-15', JSON.stringify(ls1))
  check('รายงานว่าเขียนวันหมดอายุแล้ว', rs1.stamped === true && rs1.applied === 0, JSON.stringify(rs1))

  // วันที่บนกล่องเชื่อได้กว่าที่คีย์ไว้ตอนรับเข้า — ทับของเดิม
  await applyCountDiff(supabase, {
    productId: stamp, diff: -1, expiryDate: '2027-04-20', reason: 'นับสต็อก TEST', createdBy: null,
  })
  const ls2 = await lotsOf(stamp)
  check('กรอกวันหมดอายุใหม่ → ทับของเดิม', ls2[0]?.expiry_date === '2027-04-20', JSON.stringify(ls2))

  // มีหลาย lot แต่ของเหลืออยู่ lot เดียว (lot อื่นตัดหมดไปแล้ว) → เขียนได้
  // เงื่อนไขนี้ต้องตรงกับ canStampExpiry ที่หน้าจอใช้ ไม่งั้นช่องโผล่แต่เขียนไม่ลง (หรือกลับกัน)
  const rs3 = await applyCountDiff(supabase, {
    productId: twoLots, diff: 0, expiryDate: '2030-01-01', reason: 'นับสต็อก TEST', createdBy: null,
  })
  const ls3 = await lotsOf(twoLots)
  check('ของเหลือ lot เดียว (lot อื่นหมด) → เขียนวันหมดอายุลง lot ที่มีของ',
    rs3.stamped === true && ls3.find((l) => l.quantity > 0)?.expiry_date === '2030-01-01', JSON.stringify(ls3))

  // ของจริงอยู่สอง lot — บอกไม่ได้ว่าวันที่บนกล่องเป็นของ lot ไหน ต้องไม่เขียนอะไรเลย
  const ambig = await makeProduct('หลายล็อตกรอกวันหมดอายุ', [
    { qty: 4, expiry: null },
    { qty: 6, expiry: null },
  ])
  const rs4 = await applyCountDiff(supabase, {
    productId: ambig, diff: 0, expiryDate: '2030-02-02', reason: 'นับสต็อก TEST', createdBy: null,
  })
  const ls4 = await lotsOf(ambig)
  check('ของอยู่หลาย lot + นับรวม → ไม่เขียนวันหมดอายุทับ lot ไหนเลย',
    rs4.stamped === false && !ls4.some((l) => l.expiry_date === '2030-02-02'), JSON.stringify(ls4))

  // เลือก lot แล้วกรอก — ลงที่ lot นั้น lot เดียว อีก lot ต้องยังว่าง
  const [ambigLot] = await lotIdsOf(ambig)
  const rs5 = await applyCountDiff(supabase, {
    productId: ambig, lotId: ambigLot, diff: 0, expiryDate: '2030-02-02', reason: 'นับสต็อก TEST', createdBy: null,
  })
  const ls5 = await lotsOf(ambig)
  check('เลือก lot แล้วกรอก → เขียนลง lot นั้น lot เดียว',
    rs5.stamped === true && ls5.filter((l) => l.expiry_date === '2030-02-02').length === 1, JSON.stringify(ls5))

  // สินค้าไม่มี lot เลย — lot ที่ระบบสร้างให้ต้องรับวันหมดอายุไปด้วย
  const fresh = await makeProduct('ไม่มีล็อตแต่กรอกวันหมดอายุ', [])
  const rs6 = await applyCountDiff(supabase, {
    productId: fresh, diff: 3, expiryDate: '2028-08-08', reason: 'นับสต็อก TEST', createdBy: null,
  })
  const ls6 = await lotsOf(fresh)
  check('ไม่มี lot → lot ที่สร้างให้ได้วันหมดอายุไปด้วย',
    rs6.stamped === true && ls6[0]?.quantity === 3 && ls6[0]?.expiry_date === '2028-08-08', JSON.stringify(ls6))

  console.log('\n— เงื่อนไขที่หน้าจอใช้ตัดสินใจ —')

  const oneStocked = { id: 'x', name: '', sku: null, barcode: null, unit: 'ซอง', price: 0, cost: null, category_id: null,
    product_lots: [{ id: 'a', lot_number: null, expiry_date: null, quantity: 4 }, { id: 'b', lot_number: null, expiry_date: null, quantity: 0 }] }
  check('lot ที่ของหมดแล้วไม่โผล่ตัวเลือก lot', lotsWithStock(oneStocked).length === 1)
  check('มีของ lot เดียว (ที่เหลือหมด) → กรอกวันหมดอายุได้', canStampExpiry(oneStocked, null) === true)

  const twoStocked = { ...oneStocked, product_lots: [
    { id: 'a', lot_number: null, expiry_date: '2027-01-01', quantity: 4 },
    { id: 'b', lot_number: null, expiry_date: '2026-01-01', quantity: 2 },
  ] }
  check('มีของหลาย lot + นับรวม → ยังกรอกวันหมดอายุไม่ได้', canStampExpiry(twoStocked, null) === false)
  check('มีของหลาย lot + เลือก lot แล้ว → กรอกได้', canStampExpiry(twoStocked, 'b') === true)
  check('ตัวเลือก lot เรียงใกล้หมดอายุก่อน', lotsWithStock(twoStocked)[0].id === 'b')

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
  const { count: otherItems } = await supabase
    .from('stock_count_items').select('id', { count: 'exact', head: true }).neq('count_id', round.id)
  check('จำนวนรายการนับของรอบอื่นไม่เปลี่ยน', otherItems === baselineItems,
    `(ก่อน ${baselineItems} หลัง ${otherItems})`)
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
