/**
 * ตรวจการคิดเงินทอนตอนปิดกะ (ยอดรวม) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 *
 *   npx tsx scripts/verify-shift-float.ts
 */
import { planFloat } from '../src/lib/shiftFloat'

let failed = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

// กะจริง 24 พ.ย. 2026: นับได้ ฿6,197 มีแบงค์ห้าสิบ 1 ใบ → เหลือ ฿4,050 ให้เจ้าของ ฿2,147
const a = planFloat({ 1000: 2, 500: 4, 100: 18, 50: 1, 20: 10, 10: 10, 5: 8, 1: 7 }, 4000, [50])
check(a.outTotal - a.putTotal === a.net && a.leftover === 4050, 'เหลือ = ฿4,000 + แบงค์ห้าสิบที่คาเก๊ะ', JSON.stringify(a))
check(a.net + a.leftover === 6197, 'ให้เจ้าของ + เหลือ = ที่นับได้', `${a.net} + ${a.leftover}`)
check(a.net === 2147, 'ให้เจ้าของ ฿2,147 ตรงกับกะจริง')

// แบงค์/เหรียญคนละแบบแต่ยอดรวมเท่ากัน ต้องได้ผลเดียวกัน
const x = planFloat({ 100: 18, 20: 40, 500: 2, 10: 20, 5: 30, 1: 50 }, 4000, [50])
const y = planFloat({ 100: 18, 20: 40, 500: 2, 10: 25, 5: 20, 1: 50 }, 4000, [50])
check(JSON.stringify(x) === JSON.stringify(y) && x.net === 0, 'แบงค์/เหรียญต่างกันแต่ยอดรวมเท่ากัน = ผลเดียวกัน')

check(planFloat({ 100: 30 }, 4000).net === -1000, 'เงินในเก๊ะน้อยกว่าชุด = เจ้าของเติม (ติดลบ)')
process.exit(failed ? 1 : 0)
