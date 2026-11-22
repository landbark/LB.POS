// เงินทอนตั้งต้นคงที่ — ตอนปิดกะแยกเงินออกให้เจ้าของจนเหลือในลิ้นชักเท่ายอดที่ตั้งไว้พอดี
//
// หน้าปิดกะกรอกแค่ "เหลือไว้เป็นเงินทอนกี่ใบ" ช่องเดียว · ให้เจ้าของเท่าไหร่คิดจากส่วนต่าง (ดู ownerSide
// ท้ายไฟล์) ที่นี่จึงมีหน้าที่แค่คิดค่าตั้งต้นของช่องนั้นให้ ไม่ได้เป็นตัวตัดสินว่าเงินออกไปเท่าไหร่
//
// เดิมเหลือเท่าไหร่ก็ยกไปเท่านั้น ยอดเลยลอยไปเรื่อย (4,591 → 4,265 → 4,221 → 3,439 → 6,348)
// เช้ามาไม่มีใครรู้ว่าควรนับได้เท่าไหร่ ถ้าคืนก่อนนับผิดหรือเงินหายก็ไม่มีใครจับได้
// ตั้งยอดคงที่ไว้แล้วเช้ามานับไม่ได้ยอดนั้น = ผิดแน่ ๆ รู้ทันทีตั้งแต่ก่อนเริ่มขาย
//
// หยิบออกเฉพาะแบงค์ — เหรียญคือเงินทอน หยิบออกไม่ได้
//
// บางชนิดกำหนดเป้าไม่ได้เลย: แบงค์ห้าสิบแลกจากธนาคารแทบไม่ได้ ที่มีคือรับมาจากลูกค้าล้วน ๆ
// ชนิดพวกนี้ใส่ไว้ใน `keepAll` — มีเท่าไหร่เก็บไว้เท่านั้น ไม่หยิบออก ไม่เตือนว่าขาด
//
// กำหนดได้สองแบบ: กำหนดรายชนิด (ร้อย 15 · ยี่สิบ 40 · เหรียญบาท 50 ...) ใช้ planByDenom
// หรือกำหนดแค่ยอดรวมแล้วให้ไล่หยิบใบใหญ่ลงมา ใช้ planOwnerTake
// ตอนปิดกะเงินกลับไปหาเจ้าของด้วยการ "โยกทั้งชุด" (planSwap) เป็นหลัก — รวบของเก่าออกมาทั้งกอง
// แล้ววางชุดที่เจ้าของนับไว้ล่วงหน้าลงไป ไม่ต้องนับทีละกองที่เก๊ะ · คืนเฉพาะส่วนเกินรายกอง
// (planByDenom) เหลือไว้เป็นทางสำรองของคืนที่ไม่ได้เตรียมชุดใหม่ไว้ ดูท้ายไฟล์
//
// รายชนิดดีกว่า เพราะยอดรวมคุมแค่ว่าเหลือเท่าไหร่ ไม่ได้คุมว่าเหลือเป็นแบงค์อะไร —
// เหลือ ฿3,000 ที่เป็นแบงค์ร้อย 30 ใบ ทอนไม่ได้สักบาท (28 ต.ค. เปิดร้านด้วยแบงค์ยี่สิบ 2 ใบ
// แล้วต้องเติมเงินทอนกลางวัน ทั้งที่ยอดรวมในเก๊ะตอนเช้า ฿3,454 ดูไม่ขาดอะไรเลย)

/** ชนิดธนบัตร/เหรียญที่ใช้นับเงินในลิ้นชัก — แบงค์หยิบออกให้เจ้าของได้ เหรียญหยิบไม่ได้ */
export const BANKNOTES = [
  { value: 1000, label: 'แบงค์พัน' },
  { value: 500, label: 'แบงค์ห้าร้อย' },
  { value: 100, label: 'แบงค์ร้อย' },
  { value: 50, label: 'แบงค์ห้าสิบ' },
  { value: 20, label: 'แบงค์ยี่สิบ' },
]
export const COINS = [
  { value: 10, label: 'เหรียญสิบ' },
  { value: 5, label: 'เหรียญห้า' },
  { value: 2, label: 'เหรียญสอง' },
  { value: 1, label: 'เหรียญบาท' },
]
export const DENOMS = [...BANKNOTES, ...COINS]

export interface FloatPlan {
  /** จำนวนใบที่ควรแยกให้เจ้าของ แยกตามชนิดแบงค์ */
  take: Record<number, number>
  /** รวมเงินที่แยกออก */
  taken: number
  /** เงินที่เหลือในลิ้นชัก = เงินตั้งต้นของกะถัดไป */
  leftover: number
  /** เหลือเกินเป้าเท่าไหร่ เพราะแตกแบงค์ให้พอดีไม่ได้ (เช่น เกิน 15 แต่มีแต่ใบละ 20) · 0 = ลงตัว */
  over: number
  /** นับได้น้อยกว่าเป้าเท่าไหร่ — เงินทอนไม่พอ ต้องเติมก่อนเปิดกะหน้า · 0 = ไม่ขาด */
  short: number
  /** กองที่เหลือไม่ถึงเป้าและหาใบเล็กมาอุดไม่ได้ ต้องแลกมาเติมก่อนเปิดร้าน (เฉพาะแบบกำหนดรายชนิด) */
  shortages: { value: number; need: number; missing: number }[]
  /** มูลค่าของชนิดที่เก็บไว้ทั้งหมด — ส่วนนี้ลอยไปตามที่รับมาจากลูกค้า ไม่นับเป็นเกินเป้า */
  kept: number
  /** จำนวนที่จะเหลือในลิ้นชักหลังแยกออก แยกตามชนิด */
  keep: Record<number, number>
}

const sumOf = (counts: Record<number, number>) =>
  Object.entries(counts).reduce((s, [v, q]) => s + Number(v) * (q || 0), 0)

/**
 * คิดว่าต้องแยกแบงค์ไหนออกให้เจ้าของบ้าง ถึงจะเหลือในลิ้นชักเท่า `floatTarget`
 * `takeable` = ชนิดแบงค์ที่หยิบออกได้ (ลำดับไม่สำคัญ ฟังก์ชันเรียงใบใหญ่ก่อนให้เอง)
 */
export function planOwnerTake(
  counts: Record<number, number>,
  floatTarget: number,
  takeable: number[],
): FloatPlan {
  const total = sumOf(counts)
  if (total <= floatTarget) {
    return { take: {}, taken: 0, leftover: total, over: 0, short: floatTarget - total, shortages: [], kept: 0, keep: { ...counts } }
  }
  let remaining = total - floatTarget
  const take: Record<number, number> = {}
  for (const d of [...takeable].sort((a, b) => b - a)) {
    const n = Math.min(counts[d] ?? 0, Math.floor(remaining / d))
    if (n > 0) {
      take[d] = n
      remaining -= n * d
    }
  }
  const taken = sumOf(take)
  const keep = Object.fromEntries(
    Object.entries(counts).map(([v, q]) => [Number(v), (q || 0) - (take[Number(v)] ?? 0)]),
  )
  // เศษที่แตกแบงค์ไม่ลงตัวคาอยู่ในลิ้นชัก เหลือจึงมากกว่าเป้าเท่านั้น
  return { take, taken, leftover: total - taken, over: remaining, short: 0, shortages: [], kept: 0, keep }
}

/**
 * กำหนดเงินทอนเป็นรายชนิด — หยิบส่วนที่เกินเป้าของแต่ละชนิดออก ไม่ใช่คิดจากยอดรวม
 * ชนิดที่ไม่ได้อยู่ใน `takeable` (เหรียญ) หยิบออกไม่ได้ ส่วนเกินคาไว้ในลิ้นชัก
 * ชนิดที่เหลือไม่ถึงเป้าจะอยู่ใน `shortages` — ต้องแลกมาเติมก่อนเปิดร้านวันถัดไป
 */
export function planByDenom(
  counts: Record<number, number>,
  target: Record<number, number>,
  takeable: number[],
  keepAll: number[] = [],
): FloatPlan {
  const total = sumOf(counts)
  const take: Record<number, number> = {}
  for (const d of takeable) {
    if (keepAll.includes(d)) continue
    const extra = (counts[d] ?? 0) - (target[d] ?? 0)
    if (extra > 0) take[d] = extra
  }
  const taken = sumOf(take)
  const leftover = total - taken
  const keep = Object.fromEntries(
    Object.entries(counts).map(([v, q]) => [Number(v), (q || 0) - (take[Number(v)] ?? 0)]),
  )
  // กองที่ขาดจริง — กองที่มีใบเล็กเกินพออุดให้แล้วไม่นับว่าขาด (ดู coverFloat)
  const shortages = coverFloat(keep, target, keepAll).shortages
  // ชนิดที่เก็บไว้ทั้งหมดลอยไปตามที่รับมาจากลูกค้า — บวกเข้าไปในเป้า ไม่งั้นจะขึ้นว่าเกินทุกวัน
  const kept = keepAll.reduce((sum, d) => sum + d * (counts[d] ?? 0), 0)
  const expected = sumOf(target) + kept
  return {
    take, taken, leftover, keep, shortages, kept,
    over: Math.max(0, leftover - expected),
    short: Math.max(0, expected - leftover),
  }
}

/**
 * ชุดเงินทอนที่คำนวณจากใบนับปิดกะย้อนหลังของร้าน — ใช้เป็นค่าเริ่มต้นให้กดเลือกได้
 * ไม่มีแบงค์พัน/ห้าร้อย เพราะไม่เคยถูกจ่ายเป็นเงินทอนเลยสักวันใน 8 วันที่ข้อมูลเชื่อถือได้
 * ไม่มีแบงค์ห้าสิบ เพราะแลกมาไม่ได้ — อยู่ใน SUGGESTED_KEEP แทน ใช้แบงค์ร้อยคุมส่วนนั้น
 */
export const SUGGESTED_FLOAT: Record<number, number> = { 100: 18, 20: 40, 10: 20, 5: 30, 1: 50 }

/** ชนิดที่แนะนำให้ "เก็บไว้ทั้งหมด" — กำหนดเป้าไปก็เติมไม่ได้ */
export const SUGGESTED_KEEP: number[] = [50]

/** ฝั่งเจ้าของ — ได้มาจากส่วนต่างระหว่างใบนับของพนักงานกับเงินทอนที่เหลือไว้ ไม่ใช่ช่องที่กรอกแยก */
export interface OwnerSide {
  /** ใบที่หยิบออกจากเก๊ะไปให้เจ้าของ */
  take: Record<number, number>
  /** ใบที่เจ้าของเติมเข้าเก๊ะ (วันที่เงินทอนขาด) */
  add: Record<number, number>
  /** ยอดสุทธิที่ออกไปหาเจ้าของ · ติดลบ = เจ้าของเติมเข้ามากกว่าหยิบออก */
  net: number
  /** ส่วนต่างรายชนิดแบบมีเครื่องหมาย — บวกคือหยิบออก ลบคือเติมเข้า (เก็บลง owner_denominations) */
  signed: Record<number, number>
}

/**
 * เงินที่ออกไปหาเจ้าของ = ที่นับได้ − ที่เหลือไว้
 *
 * เดิมเป็นช่องให้กรอกเองว่าแยกให้เจ้าของกี่ใบ ซึ่งทำได้แค่ทางเดียวคือหยิบออก — วันที่เงินทอนขาด
 * แล้วเจ้าของเอามาเติม ไม่มีที่ลง ได้แต่ขึ้นเตือนว่า "ต้องเติมก่อนเปิดกะหน้า" แล้วปล่อยลอยไว้
 * คิดจากส่วนต่างแทนจึงได้ทั้งสองทางฟรี ๆ และไม่มีทางที่สองช่องจะขัดกันเอง
 */
export function ownerSide(
  counted: Record<number, number>,
  keep: Record<number, number>,
): OwnerSide {
  const take: Record<number, number> = {}
  const add: Record<number, number> = {}
  const signed: Record<number, number> = {}
  let net = 0
  for (const d of DENOMS) {
    const diff = (counted[d.value] ?? 0) - (keep[d.value] ?? 0)
    if (diff === 0) continue
    signed[d.value] = diff
    net += d.value * diff
    if (diff > 0) take[d.value] = diff
    else add[d.value] = -diff
  }
  return { take, add, net, signed }
}

// ── ใบเล็กแทนใบใหญ่ได้ ใบใหญ่แทนใบเล็กไม่ได้ ───────────────────────────────────────────
// ชุดเงินทอนตั้งไว้ว่าต้องมีห้าร้อย 2 ใบ แต่บางคืนห้าร้อยไม่พอ ใส่แบงค์ร้อยเพิ่ม 10 ใบแทน
// เงินทอนชุดนั้นทอนได้ละเอียดกว่าเดิมด้วยซ้ำ แต่ระบบเทียบทีละกองเลยขึ้นแดงว่า "ขาดแบงค์ห้าร้อย 2"
// ทุกคืน (17 พ.ย. 69 เจ้าของว่า "บางทีแบงค์ห้าร้อยมันไม่พอ ใช้แบงค์ร้อยแทน ... ขาดแบงค์ 500 ไรงี้")
//
// เทียบแบบไล่จากใบเล็กขึ้นไปแทน: ส่วนที่เกินของกองเล็กยกไปอุดกองใหญ่ที่ขาดได้ ไม่ย้อนทาง
// ร้อยเกิน ฿1,000 อุดห้าร้อยที่ขาด ฿1,000 ได้ · ห้าร้อยเกิน ฿1,000 อุดยี่สิบที่ขาดไม่ได้
// (แตกไม่ได้ ต้องวิ่งไปแลกกลางวันอยู่ดี) กองที่ขาดจริงจึงยังขึ้นเตือนเหมือนเดิม
//
// แบงค์กับเหรียญไม่ยกข้ามกัน — เหรียญเกิน ฿1,000 ไม่นับว่าอุดแบงค์ร้อยที่ขาดไป 1 ใบ
// (ทอนร้อยเป็นเหรียญบาทร้อยเหรียญไม่มีใครทำ) และแบงค์ก็แตกเป็นเหรียญเองไม่ได้

/** ผลเทียบเงินในเก๊ะกับชุดที่ตั้งไว้ · want/have เป็นจำนวนใบ · missing/substituted เป็นบาท */
export interface FloatCover {
  /** ครบชุดไหม เมื่อนับการใช้ใบเล็กแทนใบใหญ่แล้ว */
  ok: boolean
  /** ขาดรวมกี่บาท = เงินที่ต้องแลกมาเติมจริง ๆ · 0 = ครบ */
  missing: number
  piles: Record<number, { want: number; have: number; missing: number; substituted: number }>
  /** กองที่ยังขาดจริง เรียงใบใหญ่ก่อน · need = คิดเป็นใบของกองนั้นกี่ใบ */
  shortages: { value: number; need: number; missing: number }[]
  /** เงินที่เกินชุดและยกไปอุดกองไหนไม่ได้แล้ว */
  extra: number
}

/** ไล่จากใบเล็กขึ้นใบใหญ่ แยกแบงค์กับเหรียญคนละชั้น ส่วนเกินของกองเล็กยกขึ้นไปอุดกองใหญ่ */
export function coverFloat(
  counts: Record<number, number>,
  target: Record<number, number>,
  keepAll: number[] = [],
): FloatCover {
  const piles: FloatCover['piles'] = {}
  let missing = 0
  let extra = 0
  for (const tier of [BANKNOTES, COINS]) {
    let spare = 0
    for (const d of [...tier].sort((a, b) => a.value - b.value)) {
      if (keepAll.includes(d.value)) continue
      const have = counts[d.value] ?? 0
      const want = target[d.value] ?? 0
      const gap = (want - have) * d.value
      if (gap <= 0) {
        spare += -gap
        piles[d.value] = { want, have, missing: 0, substituted: 0 }
        continue
      }
      const substituted = Math.min(spare, gap)
      spare -= substituted
      missing += gap - substituted
      piles[d.value] = { want, have, missing: gap - substituted, substituted }
    }
    extra += spare
  }
  const shortages = Object.keys(piles)
    .map(Number)
    .filter((d) => piles[d].missing > 0)
    .sort((a, b) => b - a)
    .map((d) => ({ value: d, missing: piles[d].missing, need: Math.ceil(piles[d].missing / d) }))
  return { ok: missing === 0, missing, piles, shortages, extra }
}

/**
 * กองที่ขาดจนต้องทำอะไรสักอย่างก่อนเปิดร้านจริง ๆ — เศษที่พร่องไปนิดหน่อยไม่ต้องขึ้นเตือน
 *
 * เช้า 22 พ.ย. 69 เก๊ะมียี่สิบ 38 ใบจากเป้า 40 ขึ้นกล่องแดง "เงินทอนไม่พอตั้งแต่เปิดร้าน
 * แลกมาเติมก่อนเริ่มขาย" ทั้งที่เงินในเก๊ะตรงเป๊ะ (฿4,213 = ยกมา ฿4,150 + ขายหลังปิดกะ ฿63) —
 * ยี่สิบหายสองใบเพราะทอนให้คนที่มาซื้อหลังปิดกะ (รับร้อยมา 1 ใบ ทอนยี่สิบ 2 ใบ รับเหรียญบาทคืน 3)
 * บิลหลังปิดกะกินเงินทอนแบบนี้แทบทุกคืน แล้วใบเล็กที่หายไปไม่มีทางถูกใบร้อยที่รับมาอุดได้
 * (coverFloat ยกได้แต่ใบเล็ก→ใบใหญ่) เช้าไหนมีขายหลังปิดกะจึงขึ้นแดงเกือบทุกเช้า
 *
 * เปิดร้านด้วยยี่สิบ 32 ใบไม่ใช่เรื่อง เปิดด้วย 2 ใบคือเรื่อง (28 ต.ค. 69) — วัดเป็นสัดส่วนของกอง
 * ไม่ใช่จำนวนบาท เพราะกองร้อย ฿1,800 กับกองเหรียญบาท ฿50 ใช้เกณฑ์บาทเดียวกันไม่ได้
 * พร่องไม่เกิน 1 ใน 5 ของกอง = ยังขายได้ ไม่เตือน · ชุดเงินทอนถูกโยกใหม่ทั้งชุดทุกคืน (planSwap)
 * ส่วนที่พร่องจึงเป็นของคืนเดียว ไม่สะสมข้ามวัน
 */
export const SHORTAGE_TOLERANCE = 0.2

export function materialShortages(
  shortages: FloatCover['shortages'],
  target: Record<number, number>,
): FloatCover['shortages'] {
  return shortages.filter(
    (sh) => sh.missing > SHORTAGE_TOLERANCE * sh.value * (target[sh.value] ?? 0),
  )
}

/**
 * ชุดเงินทอนที่จะเหลือไว้ในเก๊ะ = ชุดตามหน้าตั้งค่าเป๊ะ ๆ · ค่าตั้งต้นของหน้าปิดกะ
 *
 * เจ้าของนับชุด ฿4,000 เตรียมไว้ล่วงหน้าทุกวัน ชุดที่ลงเก๊ะจึงไม่ได้มาจากเงินในเก๊ะ
 * (19 พ.ย. 69 "ตอนนี้เราไม่ได้เติมแล้ว เตรียมเงินทอนไว้ 4000 บาท ทุกวัน ไม่รวมแบงค์ ห้าสิบ")
 * เคยจัดชุดจากของในเก๊ะให้ (buildFloat ที่ถอดออกไปแล้ว) — ได้ตัวเลขที่ไม่ตรงกับที่ทำจริง
 * แล้วลากเรื่อง "กองนี้ขาด ต้องแลกมาเติมก่อนเปิดร้าน" ขึ้นมาให้อ่านทุกคืนฟรี ๆ
 *
 * กองที่ในเก๊ะไม่พอจะขึ้นเป็น "เจ้าของเติม n" — ของมาจากชุดที่เตรียมไว้ ไม่ใช่ให้ใครไปแลกมา
 * ชนิดที่เก็บไว้ทั้งหมด (แบงค์ห้าสิบ) เหลือตามที่นับได้ — ชุดใหม่ไม่มีกองนั้น เตรียมใส่ก็ไม่ได้
 */
export function floatSetKeep(
  counts: Record<number, number>,
  target: Record<number, number>,
  keepAll: number[] = [],
): Record<number, number> {
  return Object.fromEntries(DENOMS.map((d) => [
    d.value,
    keepAll.includes(d.value) ? (counts[d.value] ?? 0) : (target[d.value] ?? 0),
  ]))
}

/**
 * โยกชุดเงินทอนทั้งชุด — รวบเงินในเก๊ะออกมาทั้งหมด แล้ววางชุดใหม่ที่เตรียมไว้ลงไปแทน
 *
 * เดิมคิดเป็นส่วนต่างรายกอง (planByDenom): ร้อยเกิน 7 ใบหยิบออก 7 · ยี่สิบขาด 12 ใบเติมเข้า 12 ·
 * เหรียญบาทเกิน 7 หยิบออก 7 ... เงินที่ออกไปน้อยที่สุดจริง แต่คนที่เก๊ะต้องนับทีละกองทั้งเก้ากอง
 * หยิบออกกับเติมเข้าสลับกันไปคนละกอง (17 พ.ย. 69 เจ้าของว่า "ช้า ต้องมานั่งนับทีละอันเติม")
 *
 * โยกทั้งชุดแทน: เจ้าของนับชุดใหม่ ฿4,000 ไว้ล่วงหน้าตอนว่าง ตอนปิดกะรวบของเก่าออกมาทั้งกอง
 * แล้ววางชุดที่เตรียมมาลงไป ที่เก๊ะไม่มีเลขให้คิดเลยแม้แต่กองเดียว
 *
 * เงินสุทธิที่ออกไปหาเจ้าของเท่ากันเป๊ะกับวิธีเดิม (= นับได้ − ที่เหลือไว้) เพราะสองวิธีเหลือในเก๊ะเท่ากัน
 * ได้ของแถมคือเช้ามาเงินทอนครบชุดแน่นอน ไม่มีกองไหนขาดให้ต้องไปแลกมาเติมก่อนเปิดร้าน
 *
 * ชนิดใน `keepAll` ไม่ถูกรวบออก (แบงค์ห้าสิบ — แลกจากธนาคารมาเติมไม่ได้ ที่มีคือรับจากลูกค้าล้วน ๆ
 * เตรียมใส่ชุดใหม่ก็ไม่ได้) กองนั้นคาอยู่ในเก๊ะเท่าที่นับได้
 */
export interface SwapPlan {
  /** ใบที่รวบออกจากเก๊ะไปให้เจ้าของ = ที่นับได้ทั้งหมด ยกเว้นชนิดที่เก็บไว้ */
  out: Record<number, number>
  outTotal: number
  /** ชุดใหม่ที่วางลงเก๊ะ = ชุดเงินทอนที่ตั้งไว้ในหน้าตั้งค่า */
  put: Record<number, number>
  putTotal: number
  /** กองที่ไม่รวบออก คาอยู่ในเก๊ะเท่าที่นับได้ */
  stay: Record<number, number>
  stayTotal: number
  /** เงินทอนในเก๊ะหลังโยก = ชุดใหม่ + กองที่คาไว้ · เท่ากับเงินตั้งต้นของกะถัดไป */
  keep: Record<number, number>
  leftover: number
  /** สุทธิที่ออกไปหาเจ้าของ = รวบออก − วางใหม่ · ติดลบ = เจ้าของวางลงมากกว่าที่รวบออกได้ */
  net: number
}

export function planSwap(
  counts: Record<number, number>,
  set: Record<number, number>,
  keepAll: number[] = [],
): SwapPlan {
  const out: Record<number, number> = {}
  const stay: Record<number, number> = {}
  const put: Record<number, number> = {}
  const keep: Record<number, number> = {}
  for (const d of DENOMS) {
    const counted = counts[d.value] ?? 0
    if (keepAll.includes(d.value)) {
      // กองที่เก็บไว้ทั้งหมด — ชุดใหม่ไม่มีกองนี้ ของเก่าคาไว้ในเก๊ะตามที่นับได้
      if (counted > 0) stay[d.value] = counted
      keep[d.value] = counted
      continue
    }
    if (counted > 0) out[d.value] = counted
    const want = set[d.value] ?? 0
    if (want > 0) put[d.value] = want
    keep[d.value] = want
  }
  const outTotal = sumOf(out)
  const putTotal = sumOf(put)
  const stayTotal = sumOf(stay)
  return {
    out, outTotal, put, putTotal, stay, stayTotal, keep,
    leftover: putTotal + stayTotal,
    net: outTotal - putTotal,
  }
}
