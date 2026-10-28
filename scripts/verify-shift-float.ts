/**
 * ตรวจการคิดเงินทอนตั้งต้นคงที่ — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 *
 *   npx tsx scripts/verify-shift-float.ts
 *
 * โจทย์: ปิดกะแล้วต้องแยกแบงค์ไหนออกให้เจ้าของบ้าง ถึงจะเหลือในลิ้นชักเท่าเงินทอนตั้งต้นพอดี
 * และเหรียญ/แบงค์เล็กต้องไม่ถูกหยิบออก เพราะนั่นคือเงินทอนที่ต้องใช้เปิดร้านเช้าวันถัดไป
 */
import { planByDenom, planOwnerTake, SUGGESTED_FLOAT, type FloatPlan } from '../src/lib/shiftFloat'

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

// ---------- กำหนดเงินทอนรายชนิด (planByDenom) ----------
console.log('\n--- กำหนดเงินทอนรายชนิด ---')

const kit = SUGGESTED_FLOAT
const kitTotal = Object.entries(kit).reduce((s, [v, q]) => s + Number(v) * q, 0)
check(kitTotal === 3000, 'ชุดแนะนำรวม ฿3,000', `฿${kitTotal}`)

// ใบนับจริง 28 ต.ค. เทียบกับชุดแนะนำ
const g = planByDenom(real, kit, NOTES)
console.log(`\nใบนับจริง 28 ต.ค. เทียบชุดแนะนำ → ${show(g)}`)
check(g.take[1000] === 3 && g.take[500] === 2, 'หยิบแบงค์พัน/ห้าร้อยออกหมด (ชุดแนะนำไม่เก็บไว้เลย)', JSON.stringify(g.take))
check(g.take[100] === 2 && g.take[20] === 68, 'หยิบเฉพาะส่วนที่เกินเป้าของแต่ละกอง (ร้อย 17−15 · ยี่สิบ 108−40)', JSON.stringify(g.take))
check(!g.take[50], 'กองที่ขาดอยู่แล้วไม่หยิบออกอีก (ห้าสิบมี 1 ใบ เป้า 6)', JSON.stringify(g.take))
check(g.taken === 5560, 'แยกออกให้เจ้าของ ฿5,560', `฿${g.taken}`)
check(g.leftover === 3788, 'เหลือในลิ้นชัก ฿3,788', `฿${g.leftover}`)
check(g.keep[100] === 15 && g.keep[20] === 40, 'กองแบงค์เหลือเท่าเป้าพอดี', JSON.stringify(g.keep))
check(g.keep[10] === 69 && g.keep[1] === 208, 'เหรียญหยิบออกไม่ได้ ส่วนเกินคาไว้ในลิ้นชัก', JSON.stringify(g.keep))
check(g.over === 788 && g.short === 0, 'เหลือเกินเป้ารวม ฿788 = เหรียญเกิน ฿1,038 − ห้าสิบที่ขาด ฿250', `฿${g.over}`)
check(
  g.shortages.length === 1 && g.shortages[0].value === 50 && g.shortages[0].need === 5,
  'บอกว่าต้องแลกแบงค์ห้าสิบมาเติมอีก 5 ใบ ก่อนเปิดร้าน',
  JSON.stringify(g.shortages),
)

// นับได้ตรงชุดพอดี → ไม่ต้องทำอะไร
const h = planByDenom({ ...kit }, kit, NOTES)
check(h.taken === 0 && h.over === 0 && h.short === 0 && h.shortages.length === 0, 'นับได้ตรงชุดพอดี → ไม่หยิบ ไม่ขาด ไม่เกิน', show(h))

// ขาดหลายกอง → ไล่เรียงจากใบใหญ่ไปเล็ก
const i = planByDenom({ 100: 10, 20: 5, 1: 10 }, kit, NOTES)
check(
  i.shortages.map((x) => x.value).join(',') === '100,50,20,10,5,1',
  'เรียงกองที่ขาดจากใบใหญ่ไปเล็ก',
  i.shortages.map((x) => `${x.value}×${x.need}`).join(' '),
)
check(i.taken === 0, 'ไม่มีกองไหนเกินเป้า → ไม่หยิบออกเลย', `฿${i.taken}`)
check(i.short === 3000 - (1000 + 100 + 10), 'บอกว่าเงินทอนรวมขาดเท่าไหร่', `฿${i.short}`)

console.log(`\nผ่าน ${passed} · ไม่ผ่าน ${failed}`)
if (failed) process.exit(1)
