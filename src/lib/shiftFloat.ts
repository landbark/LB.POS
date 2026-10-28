// เงินทอนตั้งต้นคงที่ — ตอนปิดกะแยกเงินออกให้เจ้าของจนเหลือในลิ้นชักเท่ายอดที่ตั้งไว้พอดี
//
// เดิมเหลือเท่าไหร่ก็ยกไปเท่านั้น ยอดเลยลอยไปเรื่อย (4,591 → 4,265 → 4,221 → 3,439 → 6,348)
// เช้ามาไม่มีใครรู้ว่าควรนับได้เท่าไหร่ ถ้าคืนก่อนนับผิดหรือเงินหายก็ไม่มีใครจับได้
// ตั้งยอดคงที่ไว้แล้วเช้ามานับไม่ได้ยอดนั้น = ผิดแน่ ๆ รู้ทันทีตั้งแต่ก่อนเริ่มขาย
//
// หยิบออกเฉพาะแบงค์ ไล่จากใบใหญ่ลงมา — เหรียญกับแบงค์เล็กคือเงินทอน ต้องคาไว้ในลิ้นชัก

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
    return { take: {}, taken: 0, leftover: total, over: 0, short: floatTarget - total }
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
  // เศษที่แตกแบงค์ไม่ลงตัวคาอยู่ในลิ้นชัก เหลือจึงมากกว่าเป้าเท่านั้น
  return { take, taken, leftover: total - taken, over: remaining, short: 0 }
}
