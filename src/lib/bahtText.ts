// แปลงจำนวนเงินเป็นตัวอักษรไทย เช่น 141 → "หนึ่งร้อยสี่สิบเอ็ดบาทถ้วน"
//
// ใบเสร็จเต็มรูปแบบ (A4/A5) ต้องมีบรรทัดนี้ — เป็นธรรมเนียมเอกสารการเงินไทย
// และกันแก้ตัวเลขย้อนหลัง สลิป 80mm ไม่ต้องมี

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
// ตำแหน่งนับจากหลักหน่วยขึ้นไป
const POSITIONS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

/** อ่านเลขจำนวนเต็มไม่เกิน 6 หลัก (ไม่รวมคำว่าล้าน) */
function readGroup(digits: string): string {
  // ตัดศูนย์นำหน้าออกก่อน ไม่งั้นความยาวกลุ่มจะหลอกให้ใช้ "เอ็ด" ผิดที่
  const g = digits.replace(/^0+/, '')
  if (!g) return ''

  let out = ''
  for (let i = 0; i < g.length; i++) {
    const d = Number(g[i])
    if (d === 0) continue
    const pos = g.length - i - 1

    // หลักหน่วยของเลขตั้งแต่สองหลักขึ้นไป อ่านว่า "เอ็ด" ไม่ใช่ "หนึ่ง" (11 = สิบเอ็ด)
    if (pos === 0 && d === 1 && g.length > 1) out += 'เอ็ด'
    // หลักสิบมีคำอ่านเฉพาะ: 10 = สิบ (ไม่ใช่หนึ่งสิบ), 20 = ยี่สิบ (ไม่ใช่สองสิบ)
    else if (pos === 1 && d === 1) out += 'สิบ'
    else if (pos === 1 && d === 2) out += 'ยี่สิบ'
    else out += DIGITS[d] + POSITIONS[pos]
  }
  return out
}

/** อ่านเลขจำนวนเต็ม รองรับเกินล้านด้วยการซอยทีละ 6 หลักจากขวา */
function readInteger(n: number): string {
  if (n === 0) return DIGITS[0]

  const s = String(n)
  const groups: string[] = []
  for (let end = s.length; end > 0; end -= 6) {
    groups.unshift(s.slice(Math.max(0, end - 6), end))
  }
  return groups.map(readGroup).join('ล้าน')
}

/**
 * จำนวนเงินเป็นตัวอักษรไทย ลงท้ายด้วย "บาทถ้วน" หรือ "...สตางค์"
 * ปัดเป็นทศนิยม 2 ตำแหน่งก่อนเสมอ — ยอดบนใบเสร็จมีแค่สองตำแหน่งอยู่แล้ว
 */
export function bahtText(amount: number): string {
  const satangTotal = Math.round(Math.abs(amount) * 100)
  const baht = Math.floor(satangTotal / 100)
  const satang = satangTotal % 100

  const sign = amount < 0 ? 'ลบ' : ''
  const bahtPart = `${readInteger(baht)}บาท`
  const satangPart = satang === 0 ? 'ถ้วน' : `${readInteger(satang)}สตางค์`

  return sign + bahtPart + satangPart
}
