// เงินทอนตั้งต้นคงที่ — ตอนปิดกะแยกเงินออกให้เจ้าของจนเหลือในลิ้นชักเท่ายอดที่ตั้งไว้พอดี
//
// เดิมเหลือเท่าไหร่ก็ยกไปเท่านั้น ยอดเลยลอยไปเรื่อย (4,591 → 4,265 → 4,221 → 3,439 → 6,348)
// เช้ามาไม่มีใครรู้ว่าควรนับได้เท่าไหร่ ถ้าคืนก่อนนับผิดหรือเงินหายก็ไม่มีใครจับได้
// ตั้งยอดคงที่ไว้แล้วเช้ามานับไม่ได้ยอดนั้น = ผิดแน่ ๆ รู้ทันทีตั้งแต่ก่อนเริ่มขาย
//
// หยิบออกเฉพาะแบงค์ — เหรียญคือเงินทอน หยิบออกไม่ได้
//
// กำหนดได้สองแบบ: กำหนดรายชนิด (ร้อย 15 · ยี่สิบ 40 · เหรียญบาท 50 ...) ใช้ planByDenom
// หรือกำหนดแค่ยอดรวมแล้วให้ไล่หยิบใบใหญ่ลงมา ใช้ planOwnerTake
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
  /** กองที่เหลือไม่ถึงเป้า ต้องแลกมาเติมก่อนเปิดร้าน (เฉพาะแบบกำหนดรายชนิด) */
  shortages: { value: number; need: number }[]
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
    return { take: {}, taken: 0, leftover: total, over: 0, short: floatTarget - total, shortages: [], keep: { ...counts } }
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
  return { take, taken, leftover: total - taken, over: remaining, short: 0, shortages: [], keep }
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
): FloatPlan {
  const total = sumOf(counts)
  const targetTotal = sumOf(target)
  const take: Record<number, number> = {}
  for (const d of takeable) {
    const extra = (counts[d] ?? 0) - (target[d] ?? 0)
    if (extra > 0) take[d] = extra
  }
  const taken = sumOf(take)
  const leftover = total - taken
  const keep = Object.fromEntries(
    Object.entries(counts).map(([v, q]) => [Number(v), (q || 0) - (take[Number(v)] ?? 0)]),
  )
  const shortages = Object.keys(target)
    .map(Number)
    .filter((d) => (target[d] ?? 0) - (counts[d] ?? 0) > 0)
    .sort((a, b) => b - a)
    .map((d) => ({ value: d, need: (target[d] ?? 0) - (counts[d] ?? 0) }))
  return {
    take, taken, leftover, keep, shortages,
    over: Math.max(0, leftover - targetTotal),
    short: Math.max(0, targetTotal - leftover),
  }
}

/** ชุดเงินทอนที่คำนวณจากใบนับปิดกะย้อนหลังของร้าน — ใช้เป็นค่าเริ่มต้นให้กดเลือกได้ */
export const SUGGESTED_FLOAT: Record<number, number> = { 100: 15, 50: 6, 20: 40, 10: 20, 5: 30, 1: 50 }
