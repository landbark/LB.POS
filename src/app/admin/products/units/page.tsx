import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { packSizeFromName, suggestFactor, guessPackUnitName, packIsPosHidden } from '@/lib/packGuess'
import PackMergeClient, { type MergeCandidate, type MergedRow, type Side } from './PackMergeClient'

/**
 * หน้าทบทวนการยุบสินค้าแพ็ก (SKU ลงท้าย b = กล่อง, c = ลัง) เข้าเป็น "หน่วยขาย"
 * ของสินค้าฐาน — ตัวคูณ (กล่องละกี่ซอง) ไม่มีอยู่ในข้อมูลเดิมเลย ต้องให้คนยืนยัน
 * ระบบแค่เดาจากชื่อสินค้า/อัตราส่วนทุน/อัตราส่วนราคาให้
 */

const COLUMNS = `
  id, name, sku, unit, price, cost, active, replaced_by_unit_id,
  category_id, supplier_id, vat_applicable, clinic_only,
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
  category_id: string | null
  supplier_id: string | null
  vat_applicable: boolean | null
  clinic_only: boolean | null
  product_lots: { quantity: number }[] | null
}

const PACK_SUFFIX = /[bc]$/i

/**
 * รหัสสินค้าหลักคือ 6 ตัวแรก — ตัวที่ลงท้าย b/c/sc คือสินค้าตัวเดียวกันคนละขนาด
 * (เทียบด้วย "ตัดตัวท้ายออกตัวเดียว" ไม่พอ เพราะมี SKU อย่าง BFL086sc)
 */
const BASE_CODE_LEN = 6

const stockOf = (r: Row) => (r.product_lots ?? []).reduce((s, l) => s + l.quantity, 0)

const toSide = (r: Row): Side => ({
  id: r.id,
  sku: r.sku ?? '',
  name: r.name,
  unit: r.unit,
  price: r.price,
  cost: r.cost,
  stock: stockOf(r),
  nameHint: packSizeFromName(r.name),
})

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

  for (const marked of products) {
    if (!marked.sku || !PACK_SUFFIX.test(marked.sku)) continue
    if (marked.replaced_by_unit_id) continue

    const code = marked.sku.slice(0, BASE_CODE_LEN)
    const partnerRow = marked.sku.length > BASE_CODE_LEN ? bySku.get(code) : undefined
    const partner = partnerRow && !partnerRow.replaced_by_unit_id && partnerRow.id !== marked.id
      ? partnerRow
      : null

    // ตัวที่แพงกว่าคือหน่วยใหญ่ — ส่วนใหญ่ตัวลงท้าย b/c เป็นแพ็ก แต่มีกลับทางด้วย
    // (BFL086 = กระปุก 250 ฿ / BFL086sc = ซองแบ่งขาย 10 ฿ — ตัว sc คือหน่วยย่อย)
    const flipped = Boolean(partner && partner.price > marked.price)
    const packRow = flipped && partner ? partner : marked
    const baseRow = flipped ? marked : partner

    const pack = toSide(packRow)
    const base = baseRow ? toSide(baseRow) : null
    const unitName = guessPackUnitName(packRow.unit, packRow.sku)

    const row: MergeCandidate = {
      key: marked.id,
      baseCode: code,
      pack,
      base,
      suggestedFactor: base ? suggestFactor(pack, base, pack.nameHint) : 0,
      suggestedUnitName: unitName,
      sellablePos: !packIsPosHidden(unitName),
      // ตัวตั้งต้นสำหรับ "สร้างสินค้าฐาน" ของแถวที่ไม่มีคู่เลย
      newBase: {
        name: packRow.name.replace(/\s*1\s*(ลัง|กล่อง|กระสอบ|โหล|หีบ)\s*$/u, '').trim(),
        unit: /BAGS?|KG\b|ถุง|กระสอบ/i.test(packRow.name) ? 'ถุง' : 'ซอง',
        categoryId: packRow.category_id,
        supplierId: packRow.supplier_id,
        vatApplicable: packRow.vat_applicable,
        clinicOnly: packRow.clinic_only,
      },
    }
    if (row.base) candidates.push(row)
    else orphans.push(row)
  }

  // ที่ยุบแล้ว — โชว์ว่าผูกเป็นหน่วยอะไรไว้ และเปิด/ปิดหน้าขาย-สั่งของได้จากตรงนี้
  const { data: merged } = await supabase
    .from('product_units')
    .select('id, unit_name, factor, sku, price, cost, sellable_pos, purchasable, active, products!product_units_product_id_fkey!inner(id, name, unit, price)')
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
        ยุบสินค้าที่แยก SKU ไว้ (รหัส 6 ตัวหน้าเดียวกัน ต่อท้ายด้วย b = กล่อง, c = ลัง)
        เข้าเป็นหน่วยของสินค้าตัวเดียว — สต็อครวมเป็นกองเดียวนับเป็น{' '}
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
