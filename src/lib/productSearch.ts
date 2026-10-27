import type { Product } from './types'

/**
 * คำค้นสำรอง — คำที่พนักงานพิมพ์หา แต่ไม่มีอยู่ในชื่อสินค้าที่นำเข้ามา
 *
 * ชื่อสินค้าในระบบมาจากไฟล์ผู้จัดจำหน่าย เป็นอังกฤษตัวพิมพ์ใหญ่และเรียงคำแบบแคตตาล็อก
 * ("ROYAL CANIN INSTINCTIVE IN JELLY ADULT CATS 85G") ซึ่งไม่ตรงกับที่คนเรียกหน้าร้าน
 * (รอยัลคานินเปียก, rc แมว) — กฎพวกนี้เติมคำที่คนใช้จริงเข้าไปในกองคำค้นของสินค้า
 *
 * เติมได้ไม่อั้น เพราะการค้นต้องเจอครบทุกคำที่พิมพ์ คำที่ไม่มีใครพิมพ์ก็แค่ไม่ถูกใช้
 * แต่คำที่ผิดตัว (ติดแมวให้อาหารหมา) จะทำให้ผลค้นเพี้ยน — เงื่อนไขเลยต้องรัดกุม
 */
const ALIAS_RULES: { match: RegExp; add: string }[] = [
  // ยี่ห้อ: ตัวย่อกับคำอ่านไทยที่พนักงานพิมพ์ — ยี่ห้อที่ทำของสัตว์ชนิดเดียวพ่วงชนิดสัตว์ไปเลย
  // (ชื่อ ME-O/WHISKAS/PEDIGREE ส่วนใหญ่ไม่มีคำว่า cat/dog อยู่ในชื่อ แต่คนหาด้วย "มีโอ แมว")
  { match: /ROYAL\s*CANIN/i, add: 'rc รอยัล คานิน รอยัลคานิน' },
  { match: /SMARTHEART/i, add: 'สมาร์ทฮาร์ท สมาทฮาท' },
  { match: /WHISKAS/i, add: 'วิสกัส cat แมว' },
  { match: /\bME-?O\b/i, add: 'meo มีโอ cat แมว' },
  { match: /PEDIGREE/i, add: 'เพดดิกรี dog สุนัข หมา' },
  { match: /PURINA/i, add: 'เพียวริน่า' },
  { match: /HILL'?S/i, add: 'hills ฮิลล์ ฮิลส์' },
  { match: /JERHIGH/i, add: 'เจอร์ไฮ dog สุนัข หมา' },
  { match: /\bCIAO\b/i, add: 'เชา cat แมว' },
  { match: /\bTORO\b/i, add: 'โทโร' },
  { match: /KANIVA/i, add: 'คานิว่า' },
  { match: /KANIMAL/i, add: 'คานิมอล' },
  { match: /\bMONGE\b/i, add: 'มองจ์' },
  { match: /FELIX/i, add: 'เฟลิกซ์ cat แมว' },
  { match: /PERFECTA/i, add: 'เพอร์เฟคต้า' },
  { match: /MY\s*MAOW/i, add: 'มายเหมียว cat แมว' },
  { match: /SUKINA/i, add: 'ซูกินะ' },
  { match: /CATTY\s*CAT/i, add: 'แคทตี้ cat แมว' },
  { match: /\bHANA\b/i, add: 'ฮานะ' },
  { match: /REGALOS/i, add: 'รีกาลอส' },
  { match: /\bPUPPE\b/i, add: 'พัพเป้' },

  // ชนิดอาหาร: ชื่อในไฟล์บอกเนื้อสัมผัสกับบรรจุภัณฑ์ (JELLY/GRAVY/POUCH) ไม่เคยบอกว่า "เปียก"
  // ดูแต่คำที่บอกชนิดตรงๆ — เคยลองใช้น้ำหนักเป็นกรัมแยกเปียก/แห้ง แล้วอาหารเม็ดถุง 450 G
  // กับทรายแมว 500 G. โดนติดป้ายเปียกไปด้วย
  { match: /\bWET\b|JELLY|GRAVY|POUCH|MOUSSE|\bPATE\b|\bCAN\b|เพ้าช์|ซอง|กระป๋อง|เปียก/i, add: 'wet เปียก' },
  { match: /SNACK|TREAT|STICK|ขนม|แมวเลีย|ขนมแมวเลีย/i, add: 'snack ขนม' },

  // ชนิดสัตว์
  { match: /\bCATS?\b|KITTEN|FELINE|\bFHN\b|\bFHW\b|\bFCW\b|แมว|เหมียว/i, add: 'cat แมว' },
  { match: /\bDOGS?\b|PUPPY|PUPPIES|CANINE|สุนัข|หมา/i, add: 'dog สุนัข หมา' },
]

/** อาหารเม็ด: ขายเป็นกิโล ไม่ใช่ของเปียก และไม่ใช่ทรายแมว — หลายเงื่อนไขเลยไม่อยู่ในตารางข้างบน */
const WET_RE = ALIAS_RULES.find((r) => r.add.startsWith('wet'))!.match
const DRY_RE = /\d+(\.\d+)?\s?KG\b/i
const NOT_FOOD_RE = /LITTER|SCOOP|ทราย|SHAMPOO|แชมพู|SAND/i
/** กิโลที่เป็นช่วงน้ำหนักตัวสัตว์ ไม่ใช่ขนาดถุง — ยาหยดหลัง/ยาเห็บหมัดตั้งชื่อแบบนี้
 *  BRAVECTO (10-20KG), NEXGARD COMBO S (<2.5KG), ค่าผ่าตัดคิดตามน้ำหนัก */
const WEIGHT_RANGE_RE = /[\d.]+\s*-\s*[\d.]+\s*KG|[<>]\s*[\d.]+\s*KG/i

/** คำสำรองของสินค้าตัวหนึ่งตามชื่อ */
export function aliasesFor(name: string): string {
  const hits = ALIAS_RULES.filter((r) => r.match.test(name)).map((r) => r.add)
  if (DRY_RE.test(name) && !WET_RE.test(name) && !NOT_FOOD_RE.test(name) && !WEIGHT_RANGE_RE.test(name))
    hits.push('dry เม็ด อาหารเม็ด')
  return hits.join(' ')
}

/**
 * ข้อความทั้งหมดที่ใช้ค้นสินค้าตัวหนึ่ง — ชื่อ + รหัส + บาร์โค้ด (รวมของหน่วยยกแพ็ก)
 * + คำค้นสำรองที่ร้านพิมพ์เพิ่มเองในหน้าแก้ไขสินค้า + คำสำรองที่เดาจากชื่อให้อัตโนมัติ
 */
export function haystackOf(p: Product): string {
  return [
    p.name,
    p.sku,
    p.barcode,
    p.search_keywords,
    ...(p.product_units ?? []).flatMap((u) => [u.sku, u.barcode]),
    aliasesFor(p.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** ตัดคำค้นเป็นคำๆ — ช่องว่างซ้ำ/ขึ้นบรรทัดไม่นับ */
export const tokenize = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)

/**
 * ต้องเจอครบทุกคำ แต่ไม่สนลำดับและไม่ต้องติดกัน — ชื่อสินค้าที่นำเข้ามายาวและเรียงคำ
 * ไม่เหมือนที่คนพิมพ์ ("royal jelly" ต้องเจอ ROYAL CANIN INSTINCTIVE IN JELLY ADULT CATS 85G,
 * "sterilised 10" ต้องเจอ ROYAL CANIN STERILISED  10 KG. ที่มีช่องว่างซ้อน)
 */
export const matchesTokens = (hay: string, tokens: string[]) => tokens.every((t) => hay.includes(t))

/**
 * ลำดับความตรง: ขึ้นต้นด้วยคำค้น > มีคำค้นติดกันอยู่ในชื่อ > ครบทุกคำในชื่อ > เจอแค่ในรหัส/คำสำรอง
 * กริดหน้าขายวาดแค่ไม่กี่สิบตัว ถ้าไม่จัดลำดับ ตัวที่ตรงที่สุดจมอยู่ท้ายแถวจนไม่ถูกวาด
 */
export function scoreOf(p: Product, hay: string, q: string, tokens: string[]): number {
  if (!q) return 0
  const name = p.name.toLowerCase()
  if (name.startsWith(q)) return 0
  if (name.includes(q)) return 1
  if (matchesTokens(name, tokens)) return 2
  return matchesTokens(hay, tokens) ? 3 : 4
}

/** ทำกองคำค้นของสินค้าทั้งชุดครั้งเดียว ไม่ใช่ทุกตัวอักษรที่พิมพ์ */
export function buildHaystacks(products: Product[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const p of products) m.set(p.id, haystackOf(p))
  return m
}
