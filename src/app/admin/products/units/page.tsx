import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import PackMergeClient, { type MergeCandidate, type MergedRow } from './PackMergeClient'

/**
 * หน้าทบทวนการยุบสินค้าแพ็ก (SKU ลงท้าย b = กล่อง, c = ลัง) เข้าเป็น "หน่วยขาย"
 * ของสินค้าฐาน — ตัวคูณ (กล่องละกี่ซอง) ไม่มีอยู่ในข้อมูลเดิมเลย ต้องให้คนยืนยัน
 * ระบบแค่เดาจากอัตราส่วนทุน/ราคาให้
 */

const COLUMNS = `
  id, name, sku, unit, price, cost, active, replaced_by_unit_id,
  product_lots(quantity)
`

interface Row {
  id: string
  name: string
  sku: string | null
  unit: string
  price: number
  cost: number | null
  active: boolean
  replaced_by_unit_id: string | null
  product_lots: { quantity: number }[] | null
}

const PACK_SUFFIX = /[bc]$/i

const stockOf = (r: Row) => (r.product_lots ?? []).reduce((s, l) => s + l.quantity, 0)

/** ชื่อหน่วยที่เดาจากตัวอักษรท้าย SKU — ถ้าหน่วยของสินค้าแพ็กกรอกไว้แล้วใช้ตามนั้น */
function guessUnitName(pack: Row): string {
  if (pack.unit && pack.unit.trim()) return pack.unit.trim()
  return (pack.sku ?? '').slice(-1).toLowerCase() === 'c' ? 'ลัง' : 'กล่อง'
}

/**
 * เดาตัวคูณ
 *
 * ทุนเชื่อได้กว่า เพราะบริษัทตั้งราคาทุนต่อแพ็ก = ทุนต่อชิ้น × จำนวนชิ้นตรงๆ
 * แต่ข้อมูลเก่าบางตัวกรอกทุนต่อ "ชิ้น" ลงช่องทุนของกล่อง (อัตราส่วนจะออกมา < 1.5)
 * กรณีนั้นถอยไปใช้ราคาขาย ซึ่งมักลดราคาไว้แล้ว 3-10% — ปัดขึ้นเป็นจำนวนเต็ม
 * แล้วเทียบกับขนาดแพ็กที่เจอบ่อยในร้าน
 */
const COMMON_PACKS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 25, 30, 36, 40, 48, 50, 60, 72, 80, 100, 120, 144, 180, 200, 240]

function suggestFactor(pack: Row, base: Row): number {
  const costRatio = pack.cost && base.cost ? pack.cost / base.cost : null
  if (costRatio && costRatio >= 1.5) {
    const n = Math.round(costRatio)
    // ทุนต่อแพ็กที่หารลงตัวพอดีถือว่าชัด ใช้เลย
    if (Math.abs(costRatio - n) <= 0.1) return n
  }
  const priceRatio = base.price > 0 ? pack.price / base.price : 0
  if (priceRatio < 1.5) return costRatio && costRatio >= 1.5 ? Math.round(costRatio) : 2
  const up = Math.ceil(priceRatio - 0.01)
  // ราคาแพ็กลดไว้แล้ว ตัวคูณจริงจึงมักมากกว่าอัตราส่วนราคา — ขยับขึ้นไปหาขนาดแพ็กยอดนิยม
  // ที่ให้ส่วนลดอยู่ในช่วง 0-25% (48 ซองลด 5% ได้อัตราส่วน 45.6 → ต้องได้ 48 ไม่ใช่ 46)
  const snapped = COMMON_PACKS.find((c) => c >= up && priceRatio / c >= 0.75)
  return snapped ?? up
}

export default async function ProductUnitsPage() {
  const supabase = await createClient()

  const [{ data: { user } }, products] = await Promise.all([
    supabase.auth.getUser(),
    fetchAll<Row>((from, to) =>
      supabase.from('products').select(COLUMNS).order('sku').order('id').range(from, to) as never,
    ),
  ])

  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku as string, p]))

  const candidates: MergeCandidate[] = []
  const orphans: MergeCandidate[] = []

  for (const pack of products) {
    if (!pack.sku || !PACK_SUFFIX.test(pack.sku)) continue
    if (pack.replaced_by_unit_id) continue
    const base = bySku.get(pack.sku.slice(0, -1)) ?? null
    const unitName = guessUnitName(pack)
    const row: MergeCandidate = {
      packId: pack.id,
      packSku: pack.sku,
      packName: pack.name,
      packUnit: unitName,
      packPrice: pack.price,
      packCost: pack.cost,
      packStock: stockOf(pack),
      base: base && !base.replaced_by_unit_id
        ? {
            id: base.id,
            sku: base.sku ?? '',
            name: base.name,
            unit: base.unit,
            price: base.price,
            cost: base.cost,
            stock: stockOf(base),
          }
        : null,
      suggestedFactor: base ? suggestFactor(pack, base) : 0,
      // ลัง/กระสอบ ไม่โชว์ในหน้าขาย — ไว้ใช้สั่งของเท่านั้น
      sellablePos: !/ลัง|กระสอบ|หีบ/.test(unitName),
    }
    if (row.base) candidates.push(row)
    else orphans.push(row)
  }

  // ที่ยุบแล้ว — ดึงมาโชว์ให้เห็นว่าผูกเป็นหน่วยอะไรไว้ และแก้/ถอนได้
  const { data: merged } = await supabase
    .from('product_units')
    .select('id, unit_name, factor, sku, price, cost, sellable_pos, purchasable, active, products!inner(id, name, unit, price)')
    .order('sku')

  const mergedRows: MergedRow[] = ((merged ?? []) as never as {
    id: string
    unit_name: string
    factor: number
    sku: string | null
    price: number | null
    cost: number | null
    sellable_pos: boolean
    purchasable: boolean
    active: boolean
    products: { id: string; name: string; unit: string; price: number }
  }[]).map((u) => ({
    id: u.id,
    sku: u.sku,
    unitName: u.unit_name,
    factor: u.factor,
    price: u.price,
    cost: u.cost,
    sellablePos: u.sellable_pos,
    purchasable: u.purchasable,
    active: u.active,
    productName: u.products.name,
    baseUnit: u.products.unit,
    basePrice: u.products.price,
  }))

  return (
    <div>
      <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} />
        กลับไปหน้าสินค้า
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">หน่วยขายของสินค้า</h1>
      <p className="text-sm text-gray-500 mb-6">
        ยุบสินค้าที่แยก SKU ไว้ (ลงท้าย b = กล่อง, c = ลัง) เข้าเป็นหน่วยของสินค้าฐาน
        — สต็อครวมเป็นกองเดียวนับเป็น{' '}
        <span className="font-medium text-gray-700">หน่วยเล็กสุด</span> แล้วกล่อง/ลังเป็นแค่
        &quot;หยิบทีละเท่าไหร่&quot; ที่มีราคาของตัวเอง
      </p>

      <PackMergeClient
        candidates={candidates}
        orphans={orphans}
        merged={mergedRows}
        userId={user?.id ?? ''}
      />
    </div>
  )
}
