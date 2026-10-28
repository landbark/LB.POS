/**
 * ตรวจการคิดเงินทอนตั้งต้นคงที่ — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 *
 *   npx tsx scripts/verify-shift-float.ts
 *
 * โจทย์: ปิดกะแล้วต้องแยกแบงค์ไหนออกให้เจ้าของบ้าง ถึงจะเหลือในลิ้นชักเท่าเงินทอนตั้งต้นพอดี
 * และเหรียญ/แบงค์เล็กต้องไม่ถูกหยิบออก เพราะนั่นคือเงินทอนที่ต้องใช้เปิดร้านเช้าวันถัดไป
 */
import { planOwnerTake, type FloatPlan } from '../src/lib/shiftFloat'

const NOTES = [1000, 500, 100, 50, 20]

let passed = 0
let failed = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (ok) passed++
  else failed++
}
const show = (p: FloatPlan) =>
  `แยก ฿${p.taken} (${Object.entries(p.take).map(([v, q]) => `${v}×${q}`).join(' ') || '—'}) · เหลือ ฿${p.leftover}`

// ใบนับจริงตอนปิดกะ 28 ต.ค. 2026 — เคสที่ทำให้เริ่มทำเรื่องนี้
const real = { 1000: 3, 500: 2, 100: 17, 50: 1, 20: 108, 10: 69, 5: 108, 1: 208 }
const realTotal = 9348

const a = planOwnerTake(real, 3000, NOTES)
console.log(`ใบนับจริง 28 ต.ค. รวม ฿${realTotal} · เป้า ฿3,000 → ${show(a)}\n`)
// ส่วนเกินคือ ฿6,348 แต่แบงค์แตกได้แค่ ฿6,330 — เศษ ฿18 เป็นเหรียญ ต้องคาไว้ ไม่ใช่หยิบเกิน
check(a.taken === 6330, 'แยกออกเท่าที่แบงค์แตกได้ ฿6,330 (ไม่หยิบเกินเป้า)', `฿${a.taken}`)
check(a.leftover === 3018, 'เหลือในลิ้นชัก ฿3,018 = เป้า ฿3,000 + เศษเหรียญ ฿18', `฿${a.leftover}`)
check(a.over === 18 && a.short === 0, 'บอกว่าจะเหลือเกินเป้า ฿18 ให้คนปิดกะรู้ตัว', `เกิน ฿${a.over}`)
check(a.take[1000] === 3 && a.take[500] === 2, 'หยิบใบใหญ่ออกก่อน (พัน 3 · ห้าร้อย 2)', JSON.stringify(a.take))
check(Object.keys(a.take).every((v) => NOTES.includes(Number(v))), 'ไม่แตะเหรียญเลย — เหรียญคือเงินทอน', JSON.stringify(a.take))

// แบงค์ใหญ่ไม่พอให้หยิบ ต้องไล่ลงมาใบเล็กจนครบ
const b = planOwnerTake({ 1000: 0, 500: 1, 100: 4, 20: 10, 1: 50 }, 250, NOTES)
console.log(`\nรวม ฿${500 + 400 + 200 + 50} · เป้า ฿250 → ${show(b)}`)
check(b.leftover === 250, 'ไม่มีแบงค์พันก็ไล่ใบรองลงมาจนเหลือเท่าเป้า ฿250', `฿${b.leftover}`)
check(b.take[500] === 1 && b.take[100] === 4 && !b.take[20], 'หยิบ 500×1 100×4 = ฿900 · ใบยี่สิบคาไว้เป็นเงินทอน', JSON.stringify(b.take))

// แตกแบงค์ไม่ลงตัว — ส่วนเกิน ฿15 แต่มีแต่ใบละ 20 ขึ้นไป ต้องคาไว้ในลิ้นชัก ไม่ใช่หยิบเกิน
const c = planOwnerTake({ 100: 30, 10: 1, 5: 1 }, 3000, NOTES)
console.log(`\nรวม ฿3,015 · เป้า ฿3,000 → ${show(c)}`)
check(c.taken === 0, 'ส่วนเกิน ฿15 แตกเป็นแบงค์ไม่ได้ → ไม่หยิบอะไรเลย', `฿${c.taken}`)
check(c.over === 15, 'บอกว่าจะเหลือเกินเป้าไป ฿15', `฿${c.over}`)
check(c.leftover === 3015, 'เหลือจริง = เป้า ฿3,000 + เศษ ฿15', `฿${c.leftover}`)

// นับได้ไม่ถึงเป้า — ห้ามหยิบออก ต้องบอกว่าเงินทอนขาด
const d = planOwnerTake({ 100: 5, 20: 2 }, 1000, NOTES)
console.log(`\nรวม ฿540 · เป้า ฿1,000 → ${show(d)}`)
check(d.taken === 0, 'เงินทอนไม่ถึงเป้า → ไม่แยกให้เจ้าของ', `฿${d.taken}`)
check(d.short === 460, 'บอกว่าเงินทอนขาด ฿460', `฿${d.short}`)
check(d.leftover === 540, 'เหลือเท่าที่นับได้จริง', `฿${d.leftover}`)

// เป้า 0 = เอาออกให้หมดเท่าที่แบงค์แตกได้ (เหรียญยังอยู่)
const e = planOwnerTake({ 1000: 1, 20: 1, 5: 3 }, 0, NOTES)
check(e.taken === 1020 && e.leftover === 15, 'เป้า ฿0 → หยิบแบงค์ออกหมด เหลือแต่เหรียญ ฿15', show(e))

// นับได้เท่าเป้าพอดี
const f = planOwnerTake({ 100: 30 }, 3000, NOTES)
check(f.taken === 0 && f.over === 0 && f.short === 0 && f.leftover === 3000, 'นับได้เท่าเป้าพอดี → ไม่ต้องทำอะไร', show(f))

console.log(`\nผ่าน ${passed} · ไม่ผ่าน ${failed}`)
if (failed) process.exit(1)
