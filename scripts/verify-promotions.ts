/**
 * ตรวจว่า migration โปรโมชั่นลงครบ และกฎใหม่คิดส่วนลดถูก — ไม่แตะข้อมูลของร้าน
 *
 *   npx tsx scripts/verify-promotions.ts
 *
 * สร้างสินค้า + โปรโมชั่นทดสอบ (active = false / ย้อนหลัง จึงไม่โผล่หน้าขาย)
 * ยิงตรรกะจริงจาก src/lib/promotions.ts แล้วลบทุกอย่างที่สร้างทิ้งตอนจบ
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bestPromotion, toPromotion, promotionInChannel, PROMOTION_SELECT, describePromotion } from '../src/lib/promotions'

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

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : `  — ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)}`}`)
}

const created: { table: string; id: string }[] = []

async function main() {
  // ── 1) โครงตารางลงครบไหม ────────────────────────────────────
  console.log('\n1) โครงสร้างฐานข้อมูล')

  // เช็คคอลัมน์ด้วยการ select จริง — PostgREST ฟ้องเองถ้าคอลัมน์ไม่มี
  const { error: newColsErr } = await supabase
    .from('promotions')
    .select('discount_amount, amount_mode, min_quantity, min_amount, max_discount')
    .limit(1)
  check('คอลัมน์ใหม่ครบ (discount_amount, amount_mode, min_quantity, min_amount, max_discount)', newColsErr?.message ?? 'ok', 'ok')

  const { error: scopeColErr } = await supabase.from('promotions').select('channel_scope').limit(1)
  check('คอลัมน์ channel_scope ลงแล้ว (โปรแยกหน้าร้าน/ออกบูธ)', scopeColErr?.message ?? 'ok', 'ok')

  const { error: oldColErr } = await supabase.from('promotions').select('product_id').limit(1)
  check('คอลัมน์เก่า product_id ถูกลบแล้ว', oldColErr ? 'ลบแล้ว' : 'ยังอยู่', 'ลบแล้ว')

  const { error: ppErr } = await supabase.from('promotion_products').select('promotion_id').limit(1)
  check('ตาราง promotion_products ใช้ได้', ppErr?.message ?? 'ok', 'ok')

  const { error: pcErr } = await supabase.from('promotion_categories').select('promotion_id').limit(1)
  check('ตาราง promotion_categories ใช้ได้', pcErr?.message ?? 'ok', 'ok')

  // apply_to ต้องรับค่าพหูพจน์ได้แล้ว
  const { data: cat } = await supabase.from('categories').select('id, name').limit(1).single()
  if (!cat) throw new Error('ไม่มีหมวดหมู่ในระบบ — ตรวจไม่ได้')

  // ── 2) ของเดิมถูกย้ายเข้าตารางเชื่อมครบไหม ───────────────────
  console.log('\n2) โปรโมชั่นเดิมในร้าน')
  const { data: liveRows } = await supabase.from('promotions').select(PROMOTION_SELECT)
  const live = (liveRows ?? []).map((r) => toPromotion(r as never))
  console.log(`  มีโปรโมชั่นทั้งหมด ${live.length} รายการ`)
  const orphan = live.filter(
    (p) => (p.apply_to === 'products' && p.product_ids.length === 0) ||
           (p.apply_to === 'categories' && p.category_ids.length === 0),
  )
  check('ไม่มีโปรเดิมที่ขอบเขตหายไประหว่างย้าย', orphan.map((p) => p.name), [])
  // migration ตั้ง default 'all' ให้ของเดิมทั้งหมด — พฤติกรรมเดิมคือลดทั้งที่ร้านและที่บูธ
  check('โปรเดิมถูกตั้ง "ใช้ที่ไหน" ให้เองครบ', live.filter((p) => !p.channel_scope).map((p) => p.name), [])
  for (const p of live) {
    console.log(`    · ${p.name} — ${describePromotion(p)} [${p.apply_to} · ${p.channel_scope}]`)
  }

  // ── 3) สร้างของทดสอบแล้วยิงตรรกะจริง ─────────────────────────
  console.log('\n3) คิดส่วนลดตามกฎใหม่')

  const { data: product, error: prodErr } = await supabase
    .from('products')
    .insert({
      name: 'ทดสอบโปรโมชั่น (ลบอัตโนมัติ)',
      sku: `TEST-PROMO-${Date.now()}`,
      price: 100,
      cost: 50,
      unit: 'ชิ้น',
      category_id: cat.id,
      active: false,
    })
    .select('id, price, category_id')
    .single()
  if (prodErr || !product) throw new Error('สร้างสินค้าทดสอบไม่สำเร็จ: ' + prodErr?.message)
  created.push({ table: 'products', id: product.id })

  const past = '2020-01-01'
  async function makePromo(fields: Record<string, unknown>, scope?: { products?: string[]; categories?: string[] }) {
    const { data, error } = await supabase
      .from('promotions')
      .insert({
        name: 'ทดสอบ (ลบอัตโนมัติ)',
        start_date: past,
        end_date: past,
        active: false,
        apply_to: 'all',
        ...fields,
      })
      .select(PROMOTION_SELECT)
      .single()
    if (error || !data) throw new Error('สร้างโปรทดสอบไม่สำเร็จ: ' + error?.message)
    const promo = toPromotion(data as never)
    created.push({ table: 'promotions', id: promo.id })

    if (scope?.products?.length) {
      const { error: e } = await supabase
        .from('promotion_products')
        .insert(scope.products.map((product_id) => ({ promotion_id: promo.id, product_id })))
      if (e) throw new Error('ผูกสินค้าไม่สำเร็จ: ' + e.message)
      promo.product_ids = scope.products
    }
    if (scope?.categories?.length) {
      const { error: e } = await supabase
        .from('promotion_categories')
        .insert(scope.categories.map((category_id) => ({ promotion_id: promo.id, category_id })))
      if (e) throw new Error('ผูกหมวดไม่สำเร็จ: ' + e.message)
      promo.category_ids = scope.categories
    }
    return promo
  }

  const target = { id: product.id, category_id: product.category_id, price: product.price }

  // ลดเป็นบาท ต่อชิ้น — ซื้อ 3 ชิ้น ลด 20 × 3 = 60
  const perUnit = await makePromo({
    type: 'amount_discount', discount_amount: 20, amount_mode: 'per_unit',
    apply_to: 'products',
  }, { products: [product.id] })
  check('ลด 20 บาท/ชิ้น × 3 ชิ้น', bestPromotion([perUnit], target, 3, 300)?.discount, 60)

  // ลดเป็นบาท ต่อรายการ — ซื้อ 3 ชิ้น ลด 20 ครั้งเดียว
  const perLine = await makePromo({
    type: 'amount_discount', discount_amount: 20, amount_mode: 'per_line',
    apply_to: 'products',
  }, { products: [product.id] })
  check('ลด 20 บาท/รายการ × 3 ชิ้น', bestPromotion([perLine], target, 3, 300)?.discount, 20)

  // เงื่อนไขซื้อครบจำนวน — ครบ 5 ชิ้นถึงลด 10%
  const minQty = await makePromo({
    type: 'percent_discount', discount_percent: 10, min_quantity: 5,
    apply_to: 'products',
  }, { products: [product.id] })
  check('ซื้อครบ 5 ชิ้นลด 10% — ซื้อ 4 ชิ้น (ยังไม่ครบ)', bestPromotion([minQty], target, 4, 400), null)
  check('ซื้อครบ 5 ชิ้นลด 10% — ซื้อ 5 ชิ้น (ครบ)', bestPromotion([minQty], target, 5, 500)?.discount, 50)

  // เงื่อนไขซื้อครบยอดเงิน + ลดเป็นบาท
  const minAmount = await makePromo({
    type: 'amount_discount', discount_amount: 50, amount_mode: 'per_line', min_amount: 500,
    apply_to: 'products',
  }, { products: [product.id] })
  check('ยอดครบ 500 ลด 50 — ยอด 400 (ยังไม่ครบ)', bestPromotion([minAmount], target, 4, 400), null)
  check('ยอดครบ 500 ลด 50 — ยอด 500 (ครบ)', bestPromotion([minAmount], target, 5, 500)?.discount, 50)

  // เพดานส่วนลด
  const capped = await makePromo({
    type: 'percent_discount', discount_percent: 50, max_discount: 30,
    apply_to: 'products',
  }, { products: [product.id] })
  check('ลด 50% เพดาน 30 บาท — ยอด 300', bestPromotion([capped], target, 3, 300)?.discount, 30)

  // เลือกหลายรายการ — ผูกหมวดของสินค้าทดสอบเข้าไปด้วย ต้องเข้าเงื่อนไข
  const multiCat = await makePromo({
    type: 'percent_discount', discount_percent: 5, apply_to: 'categories',
  }, { categories: [cat.id] })
  check('โปรระดับหมวด (เลือกหลายหมวดได้) จับสินค้าในหมวดถูก', bestPromotion([multiCat], target, 1, 100)?.discount, 5)

  // เข้าหลายโปรพร้อมกัน → ต้องเลือกอันที่ลดเยอะสุด
  const best = bestPromotion([multiCat, perUnit, perLine], target, 3, 300)
  check('เข้า 3 โปรพร้อมกัน เลือกอันที่ลดเยอะสุด (60 จาก per_unit)', best?.discount, 60)

  // สินค้าที่ไม่ได้อยู่ในขอบเขต ต้องไม่โดนโปร
  const other = { id: '00000000-0000-0000-0000-000000000000', category_id: null, price: 100 }
  check('สินค้านอกขอบเขต ไม่ได้ส่วนลด', bestPromotion([perUnit, multiCat], other, 10, 1000), null)

  // ── 4) โปรแยกหน้าร้าน / งานออกบูธ ────────────────────────────
  console.log('\n4) ใช้ที่ไหน (หน้าร้าน / งานออกบูธ)')

  const boothPromo = await makePromo({
    type: 'percent_discount', discount_percent: 15, apply_to: 'products',
    channel_scope: 'booth', end_date: null,
  }, { products: [product.id] })
  check('end_date ว่างได้ = ไม่มีวันหมด (ใช้ซ้ำได้ทุกรอบ)', boothPromo.end_date, null)
  check('โปรบูธไม่เด้งตอนขายหน้าร้าน', promotionInChannel(boothPromo, false), false)
  check('โปรบูธเด้งในโหมดบูธ', promotionInChannel(boothPromo, true), true)

  // ตั้งเปอร์เซ็นต์ไม่เท่าโปรบูธ เพื่อแยกออกว่าส่วนลดที่ได้มาจากโปรตัวไหน
  const storePromo = await makePromo({
    type: 'percent_discount', discount_percent: 10, apply_to: 'products',
    channel_scope: 'store',
  }, { products: [product.id] })
  check('โปรหน้าร้านไม่เด้งที่บูธ', promotionInChannel(storePromo, true), false)
  check('โปรหน้าร้านเด้งที่ร้าน', promotionInChannel(storePromo, false), true)

  const anywherePromo = await makePromo({
    type: 'percent_discount', discount_percent: 5, channel_scope: 'all',
  })
  check(
    'โปร "ทุกที่" เด้งทั้งสองโหมด',
    [promotionInChannel(anywherePromo, false), promotionInChannel(anywherePromo, true)],
    [true, true],
  )

  // หน้าขายกรองตามโหมดก่อนส่งเข้า bestPromotion — ในโหมดบูธต้องเหลือโปรบูธ + โปรทุกที่
  const atBooth = [boothPromo, storePromo, anywherePromo].filter((p) => promotionInChannel(p, true))
  check('โหมดบูธเหลือโปรที่ใช้ได้ 2 อัน', atBooth.length, 2)
  check('โหมดบูธลดด้วยโปรบูธ 15% ของยอด 300', bestPromotion(atBooth, target, 3, 300)?.discount, 45)

  const atStore = [boothPromo, storePromo, anywherePromo].filter((p) => promotionInChannel(p, false))
  check('หน้าร้านลดด้วยโปรหน้าร้าน 10% ของยอด 300 (ไม่ใช่โปรบูธ 15%)', bestPromotion(atStore, target, 3, 300)?.discount, 30)

  // ขอบเขตอ่านกลับจาก DB ได้จริง (ไม่ใช่แค่ object ในหน่วยความจำ)
  const { data: reread } = await supabase.from('promotions').select(PROMOTION_SELECT).eq('id', perUnit.id).single()
  check('อ่านขอบเขตกลับจาก DB ได้', toPromotion(reread as never).product_ids, [product.id])

  // ลบสินค้า → แถวในตารางเชื่อมต้องหายตาม (CASCADE)
  await supabase.from('products').delete().eq('id', product.id)
  created.splice(created.findIndex((c) => c.id === product.id), 1)
  const { data: afterDelete } = await supabase.from('promotion_products').select('product_id').eq('promotion_id', perUnit.id)
  check('ลบสินค้าแล้วหลุดจากโปรเอง (CASCADE)', afterDelete?.length, 0)
}

async function cleanup() {
  for (const { table, id } of created.reverse()) {
    await supabase.from(table).delete().eq('id', id)
  }
  console.log(`\nลบของทดสอบแล้ว ${created.length} รายการ`)
}

main()
  .catch((e) => { console.error('\n✗ ' + e.message); failures++ })
  .finally(async () => {
    await cleanup()
    console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด\n' : `\n❌ ไม่ผ่าน ${failures} ข้อ\n`)
    process.exit(failures === 0 ? 0 : 1)
  })
