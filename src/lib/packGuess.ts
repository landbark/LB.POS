/**
 * เดา "1 แพ็กกี่หน่วยย่อย" จากข้อมูลที่ย้ายระบบมา — ตัวคูณไม่เคยถูกเก็บไว้ที่ไหนเลย
 * ใช้ในหน้าทบทวน /admin/products/units เท่านั้น ของที่ยุบแล้วใช้ product_units.factor จริง
 */

/** ขนาดแพ็กที่เจอบ่อยในร้าน — ใช้ขยับอัตราส่วนราคาขึ้นไปหาเลขที่เป็นไปได้ */
const COMMON_PACKS = [
  2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 25, 30, 36, 40, 48, 50, 60, 72, 80, 100, 120, 144, 180, 200, 240,
]

export interface PackSide {
  price: number
  cost: number | null
}

/**
 * จำนวนต่อแพ็กที่เขียนอยู่ในชื่อสินค้า — สัญญาณที่แม่นที่สุดเพราะมาจากฉลากของบริษัท
 *
 *   "CREAMY TREAT (15Gx40)"        → 40
 *   "SUPREMO FIT&FIRM 10KG (1X10BAGS)" → 10
 *   "MOUSSE 70G X 24"              → 24
 *
 * ตัวเลขที่ติดหน่วยน้ำหนัก (70G, 10KG, 0.9X10KG) ไม่ใช่จำนวนชิ้น ต้องไม่หยิบมา
 */
export function packSizeFromName(name: string): number | null {
  const text = name.toUpperCase()

  // (15Gx40) / (1X10BAGS) / (0.9X10 BAGS) — เอาเลขหลังตัว x ที่ไม่มีหน่วยน้ำหนักตาม
  const paren = text.match(/[\d.]+\s*(?:G|GM|GR|KG|ML|L)?\s*[X×]\s*(\d+)\s*(?:BAGS?|PCS?|PACK|SACHETS?|ซอง|ถุง|ชิ้น|ซ\.|)\s*\)?/)
  if (paren) {
    const n = parseInt(paren[1])
    if (n >= 2 && n <= 1000) return n
  }

  // "X 24" / "x24ซอง" ที่ไม่ได้อยู่ในวงเล็บ
  const loose = text.match(/[X×]\s*(\d+)\s*(?:BAGS?|PCS?|PACK|SACHETS?|ซอง|ถุง|ชิ้น)/)
  if (loose) {
    const n = parseInt(loose[1])
    if (n >= 2 && n <= 1000) return n
  }
  return null
}

/**
 * ตัวคูณที่เดาได้ เรียงตามความน่าเชื่อ
 *
 * 1. ชื่อสินค้าบอกไว้ (15Gx40)
 * 2. อัตราส่วน "ทุน" — บริษัทคิดทุนต่อแพ็ก = ทุนต่อชิ้น × จำนวนชิ้นตรงๆ
 *    (ข้อมูลเก่าบางตัวกรอกทุนต่อชิ้นลงช่องทุนกล่อง อัตราส่วนจะออกมา < 1.5 ใช้ไม่ได้)
 * 3. อัตราส่วน "ราคาขาย" — ราคายกแพ็กมักลดไว้แล้ว 3-10% ตัวคูณจริงจึงมากกว่าอัตราส่วน
 *    ต้องขยับขึ้นไปหาขนาดแพ็กยอดนิยม (ลัง 48 ซองลด 5% ได้อัตราส่วน 45.6 → ต้องได้ 48 ไม่ใช่ 46)
 */
export function suggestFactor(pack: PackSide, base: PackSide, nameHint: number | null): number {
  if (nameHint && nameHint >= 2) return nameHint

  const costRatio = pack.cost && base.cost ? pack.cost / base.cost : null
  if (costRatio && costRatio >= 1.5) {
    const n = Math.round(costRatio)
    // ทุนที่หารลงตัวพอดีถือว่าชัด — แต่ต้องไม่ทำให้ราคายกแพ็กกลายเป็นลด 40-97%
    // (ทุนของหน่วยย่อยบางตัวในข้อมูลเก่าเป็นค่าหลอก เช่น ฿1.00 ทำให้ได้ตัวคูณ 432)
    if (Math.abs(costRatio - n) <= 0.1 && isPlausibleDiscount(pack.price, base.price, n)) return n
  }

  const priceRatio = base.price > 0 ? pack.price / base.price : 0
  if (priceRatio < 1.5) return costRatio && costRatio >= 1.5 ? Math.round(costRatio) : 2
  const up = Math.ceil(priceRatio - 0.01)
  return COMMON_PACKS.find((c) => c >= up && priceRatio / c >= 0.75) ?? up
}

/** ราคายกแพ็กต่อหน่วยย่อยไม่ควรถูกกว่าซื้อแยกเกิน 35% — ถูกกว่านั้นแปลว่าตัวคูณหรือทุนเพี้ยน */
function isPlausibleDiscount(packPrice: number, basePrice: number, factor: number): boolean {
  if (basePrice <= 0 || packPrice <= 0) return true
  return packPrice / (basePrice * factor) >= 0.65
}

/** ส่วนลดลึกผิดปกติ — หน้าทบทวนเอาไปขึ้นป้ายเตือนให้คนเช็กตัวคูณอีกรอบ */
export const discountLooksOff = (packPrice: number, basePrice: number, factor: number) =>
  factor > 0 && basePrice > 0 && packPrice > 0 && packPrice / (basePrice * factor) < 0.65

/** ชื่อหน่วยที่น่าจะเป็นของตัวแพ็ก — ใช้หน่วยที่กรอกไว้ก่อน ไม่มีค่อยเดาจากท้าย SKU */
export function guessPackUnitName(unit: string | null, sku: string | null): string {
  if (unit && unit.trim()) return unit.trim()
  return (sku ?? '').slice(-1).toLowerCase() === 'c' ? 'ลัง' : 'กล่อง'
}

/** หน่วยที่ไม่ควรโชว์ในหน้าขาย — ยกลัง/กระสอบไว้ใช้สั่งของ */
export const packIsPosHidden = (unitName: string) => /ลัง|กระสอบ|หีบ|โหล/.test(unitName)
