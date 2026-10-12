// เติมสต็อกคงเหลือจาก POS ลงไฟล์เทมเพลต Mass Update ของ Shopee
//
// วิธีใช้: ร้านโหลดเทมเพลตจาก Shopee Seller Centre (ไฟล์มีรหัสสินค้า/SKU/สต็อกปัจจุบันมาให้แล้ว)
// → เราเขียนทับแค่คอลัมน์สต็อกของแถวที่ SKU ตรงกับสินค้าในระบบ → ร้านอัปโหลดไฟล์กลับเข้า Shopee
//
// จับคู่กับสินค้าทุกตัวที่มี SKU โดยไม่ดูธง "ลงขายบน Shopee" เพราะแถวในไฟล์มาจาก Shopee อยู่แล้ว
// ตัวไฟล์จึงเป็นตัวบอกว่าจะอัปเดตอะไร ส่วนธงเหลือหน้าที่คัดรายการให้ไฟล์ CSV กับคอยเตือนว่าอะไรหายไปจากไฟล์
//
// แถวที่ SKU ไม่ตรงกับของเรา ตั้งใจไม่แตะเลย — ค่าเดิมจาก Shopee ยังอยู่ อัปโหลดกลับไปก็ไม่เปลี่ยนอะไร
// (เหตุผลเดียวกันคือห้ามเอาไฟล์เก่ามาใช้ซ้ำ ต้องโหลดใหม่ทุกครั้ง ไม่งั้นสต็อกเก่าจะถูกยัดกลับไป)

import type { XlsxDoc } from './xlsx'

export interface StockProduct {
  sku: string | null
  name: string
  on_shopee: boolean
  is_service: boolean
  product_lots?: { quantity: number }[] | null
}

export interface FillResult {
  stockColumn: string
  extraStockColumns: string[]
  filled: { sku: string; name: string; stock: number }[]
  duplicateSkus: string[]
  unmatchedRows: { sku: string; name: string }[]
  unflagged: { sku: string; name: string }[]
  missingFromFile: { sku: string; name: string; stock: number }[]
  noSku: string[]
}

// Shopee วางแถวหัวตาราง/metadata ไว้ต้นไฟล์ไม่กี่แถว (คีย์ et_title_*, รหัสเทมเพลต, ชื่อคอลัมน์ภาษาไทย)
const HEADER_ROWS = 4

export function stockOf(p: StockProduct) {
  return (p.product_lots ?? []).reduce((sum, l) => sum + l.quantity, 0)
}

function normalizeSku(s: string) {
  return s.trim().toUpperCase()
}

// รวมข้อความแถวหัวตารางของแต่ละคอลัมน์ไว้ก้อนเดียว เพื่อหาคอลัมน์จากคีย์หรือชื่อไทยก็ได้
function columnLabels(rows: string[][], keyRow: number) {
  const head = rows.slice(keyRow, keyRow + HEADER_ROWS)
  const width = Math.max(0, ...head.map((r) => r.length))
  return Array.from({ length: width }, (_, c) =>
    head
      .map((r) => r[c] ?? '')
      .join(' | ')
      .toLowerCase(),
  )
}

export function fillShopeeStock(doc: XlsxDoc, products: StockProduct[]): FillResult {
  const rows = doc.rows
  const keyRow = rows.findIndex((r) => r.some((c) => c.startsWith('et_title_')))
  if (keyRow < 0) {
    throw new Error(
      'ไฟล์นี้ไม่ใช่เทมเพลตของ Shopee — ต้องเป็นไฟล์ที่โหลดจาก Shopee Seller Centre โดยตรง (ห้ามเปิดแก้แล้วเซฟใหม่)',
    )
  }

  const labels = columnLabels(rows, keyRow)
  const first = (...candidates: number[]) => candidates.find((i) => i >= 0) ?? -1
  const byKey = (re: RegExp) => labels.findIndex((l) => re.test(l))
  const byText = (...needles: string[]) =>
    labels.findIndex((l) => needles.some((n) => l.includes(n.toLowerCase())))

  const stockCols = labels
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /et_title_\w*stock/.test(l))
    .map(({ i }) => i)
  if (stockCols.length === 0) {
    const fallback = byText('คลังสินค้า', 'สต็อก', 'สต๊อก', 'จำนวนคงเหลือ')
    if (fallback >= 0) stockCols.push(fallback)
  }
  if (stockCols.length === 0) {
    throw new Error(
      'ไฟล์นี้ไม่มีคอลัมน์สต็อก — ตอนโหลดเทมเพลตจาก Shopee ต้องเลือกหัวข้อที่มี "ข้อมูลการขาย/สต็อก" ด้วย (ไฟล์ข้อมูลพื้นฐานอย่างเดียวใช้ไม่ได้)',
    )
  }
  const stockCol = stockCols[0]

  const skuCols: number[] = []
  const addSkuCol = (i: number) => {
    if (i >= 0 && !skuCols.includes(i)) skuCols.push(i)
  }
  // เรียงตามความเจาะจง: SKU ของตัวเลือกสินค้าก่อน แล้วค่อย Parent SKU แล้วค่อยคอลัมน์อื่นที่มีคำว่า sku
  addSkuCol(byKey(/et_title_\w*(variation|model)\w*sku/))
  addSkuCol(byKey(/et_title_parent_sku/))
  labels.forEach((l, i) => {
    if (l.includes('sku')) addSkuCol(i)
  })
  if (skuCols.length === 0) {
    throw new Error('ไฟล์นี้ไม่มีคอลัมน์ SKU — จับคู่กับสินค้าในระบบไม่ได้')
  }

  const idCol = first(byKey(/et_title_(product|item)_id/), byText('รหัสสินค้า'))
  const nameCol = first(byKey(/et_title_(product|item)_name/), byText('ชื่อสินค้า'))

  // บริการไม่มีสต็อก จึงไม่เอาเข้าตารางจับคู่ (ถ้าอยู่ในไฟล์จะไปโผล่ในรายการที่จับคู่ไม่ได้)
  const bySku = new Map<string, StockProduct>()
  for (const p of products) {
    if (!p.is_service && p.sku?.trim()) bySku.set(normalizeSku(p.sku), p)
  }
  const flagged = products.filter((p) => p.on_shopee && !p.is_service)

  const result: FillResult = {
    stockColumn: rows[keyRow + 2]?.[stockCol] || labels[stockCol] || '',
    extraStockColumns: stockCols.slice(1).map((i) => rows[keyRow + 2]?.[i] || labels[i] || ''),
    filled: [],
    duplicateSkus: [],
    unmatchedRows: [],
    unflagged: [],
    missingFromFile: [],
    noSku: flagged.filter((p) => !p.sku?.trim()).map((p) => p.name),
  }

  const hits = new Map<string, number>()
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? []
    const isData =
      idCol >= 0
        ? /^\d{4,}(\.0+)?$/.test((row[idCol] ?? '').trim())
        : r > keyRow + 2 && skuCols.some((c) => (row[c] ?? '').trim() !== '')
    if (!isData) continue

    const values = skuCols.map((c) => (row[c] ?? '').trim()).filter(Boolean)
    const key = values.map(normalizeSku).find((v) => bySku.has(v))
    const name = (nameCol >= 0 ? row[nameCol] : '') ?? ''

    if (!key) {
      result.unmatchedRows.push({ sku: values[0] ?? '', name })
      continue
    }

    const product = bySku.get(key)!
    const stock = Math.max(0, Math.round(stockOf(product)))
    doc.setNumber(r, stockCol, stock)
    result.filled.push({ sku: product.sku!, name: name || product.name, stock })
    if (!product.on_shopee && !hits.has(key)) {
      result.unflagged.push({ sku: product.sku!, name: product.name })
    }
    hits.set(key, (hits.get(key) ?? 0) + 1)
  }

  result.duplicateSkus = [...hits].filter(([, n]) => n > 1).map(([sku]) => sku)
  result.missingFromFile = flagged
    .filter((p) => p.sku?.trim() && !hits.has(normalizeSku(p.sku)))
    .map((p) => ({ sku: p.sku!, name: p.name, stock: Math.max(0, Math.round(stockOf(p))) }))

  return result
}
