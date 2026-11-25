// เงินทอนตั้งต้น — คุมด้วย "ยอดรวม" ตัวเดียว ไม่เทียบรายชนิด
//
// เจ้าของนับชุด ฿4,000 เตรียมไว้ทุกวัน ตอนปิดกะรวบเงินเก่าออกทั้งเก๊ะแล้ววางชุดใหม่ลงไปแทน
// แต่ละชุดแบงค์/เหรียญไม่เหมือนกัน (เหรียญบาท 50 บ้าง 75 บ้าง) ยอดรวมเท่ากันเสมอ
// เคยตั้งเป้ารายชนิดไว้ เช้าไหนกองไม่ตรงก็ขึ้นแดงทั้งที่ยอดรวมถูก เจ้าของสั่งเลิก 25 พ.ย. 69
//
// แบงค์ห้าสิบ (store_settings.float_keep) ไม่อยู่ในชุด — มีเท่าไหร่คาไว้ในเก๊ะเท่านั้น

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
  /** เงินที่รวบออกให้เจ้าของ = นับได้ − ชนิดที่คาไว้ */
  outTotal: number
  /** ชุดใหม่ที่วางลงเก๊ะ */
  putTotal: number
  /** มูลค่าของชนิดที่คาไว้ในเก๊ะ */
  stayTotal: number
  /** เงินตั้งต้นของกะถัดไป = ชุดใหม่ + ที่คาไว้ */
  leftover: number
  /** สุทธิที่เจ้าของรับไป · ติดลบ = เจ้าของวางลงมากกว่าที่รวบออกได้ */
  net: number
}

export function planFloat(
  counts: Record<number, number>,
  floatTarget: number,
  keepAll: number[] = [],
): FloatPlan {
  const counted = DENOMS.reduce((s, d) => s + d.value * (counts[d.value] ?? 0), 0)
  const stayTotal = keepAll.reduce((s, v) => s + v * (counts[v] ?? 0), 0)
  const outTotal = counted - stayTotal
  return {
    outTotal,
    putTotal: floatTarget,
    stayTotal,
    leftover: floatTarget + stayTotal,
    net: outTotal - floatTarget,
  }
}
