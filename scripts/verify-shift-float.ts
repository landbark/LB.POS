/**
 * ตรวจการคิดเงินทอนตั้งต้นคงที่ — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 *
 *   npx tsx scripts/verify-shift-float.ts
 *
 * โจทย์: ปิดกะแล้วต้องแยกแบงค์ไหนออกให้เจ้าของบ้าง ถึงจะเหลือในลิ้นชักเท่าเงินทอนตั้งต้นพอดี
 * และเหรียญ/แบงค์เล็กต้องไม่ถูกหยิบออก เพราะนั่นคือเงินทอนที่ต้องใช้เปิดร้านเช้าวันถัดไป
 */
import { ownerSide, planByDenom, planOwnerTake, SUGGESTED_FLOAT, SUGGESTED_KEEP, type FloatPlan } from '../src/lib/shiftFloat'

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
check(!kit[50] && SUGGESTED_KEEP.includes(50), 'ชุดแนะนำไม่กำหนดแบงค์ห้าสิบ แต่ให้เก็บไว้ทั้งหมด (แลกมาไม่ได้)')
check(!kit[1000] && !kit[500], 'ชุดแนะนำไม่เก็บแบงค์พัน/ห้าร้อย — ไม่เคยถูกจ่ายเป็นเงินทอน')

// ใบนับจริง 28 ต.ค. เทียบกับชุดแนะนำ (ยังไม่ใช้ "เก็บไว้ทั้งหมด")
const g = planByDenom(real, kit, NOTES)
console.log(`\nใบนับจริง 28 ต.ค. เทียบชุดแนะนำ → ${show(g)}`)
check(g.take[1000] === 3 && g.take[500] === 2, 'หยิบแบงค์พัน/ห้าร้อยออกหมด (ชุดแนะนำไม่เก็บไว้เลย)', JSON.stringify(g.take))
check(g.take[20] === 68, 'หยิบเฉพาะส่วนที่เกินเป้าของแต่ละกอง (ยี่สิบ 108−40)', JSON.stringify(g.take))
check(g.take[50] === 1, 'ไม่ได้ตั้งเก็บไว้ = แบงค์ห้าสิบถูกหยิบออกหมด (เป้า 0)', JSON.stringify(g.take))
check(!g.take[100], 'ร้อยมี 17 เป้า 18 → ขาดอยู่ ไม่หยิบออก', JSON.stringify(g.take))
check(g.keep[20] === 40, 'กองยี่สิบเหลือเท่าเป้าพอดี', JSON.stringify(g.keep))
check(g.keep[10] === 69 && g.keep[1] === 208, 'เหรียญหยิบออกไม่ได้ ส่วนเกินคาไว้ในลิ้นชัก', JSON.stringify(g.keep))
check(
  g.shortages.length === 1 && g.shortages[0].value === 100 && g.shortages[0].need === 1,
  'บอกว่าต้องแลกแบงค์ร้อยมาเติมอีก 1 ใบ (ห้าสิบไม่เตือนเพราะเป้าเป็น 0)',
  JSON.stringify(g.shortages),
)

// ---------- เก็บไว้ทั้งหมด (keepAll) ----------
console.log('\n--- ชนิดที่เก็บไว้ทั้งหมด ---')
const k = planByDenom(real, kit, NOTES, SUGGESTED_KEEP)
console.log(`ใบนับจริง 28 ต.ค. · ชุดแนะนำ + เก็บแบงค์ห้าสิบไว้ทั้งหมด → ${show(k)}`)
check(!k.take[50], 'แบงค์ห้าสิบไม่ถูกหยิบออกเลย แม้ไม่มีเป้า', JSON.stringify(k.take))
check(k.keep[50] === 1, 'มีห้าสิบกี่ใบก็เหลือไว้เท่านั้น', String(k.keep[50]))
check(k.kept === 50, 'รายงานมูลค่าของชนิดที่เก็บไว้ทั้งหมด ฿50', `฿${k.kept}`)
check(k.shortages.every((sh) => sh.value !== 50), 'ไม่เตือนว่าห้าสิบขาด — แลกมาไม่ได้อยู่แล้ว', JSON.stringify(k.shortages))
check(k.taken === g.taken - 50, 'แยกออกน้อยลงเท่ามูลค่าห้าสิบที่เก็บไว้', `฿${k.taken} vs ฿${g.taken}`)

// ชนิดที่เก็บไว้ทั้งหมดต้องไม่ถูกนับเป็น "เกินเป้า" ไม่งั้นจะขึ้นเตือนทุกวันที่ลูกค้าจ่ายห้าสิบมา
const exact = { 100: 18, 50: 7, 20: 40, 10: 20, 5: 30, 1: 50 }
const ex = planByDenom(exact, kit, NOTES, SUGGESTED_KEEP)
check(ex.taken === 0 && ex.over === 0 && ex.short === 0, 'ครบชุดพอดี + ห้าสิบ 7 ใบ → ไม่หยิบ ไม่เกิน ไม่ขาด', show(ex))
check(ex.kept === 350, 'ห้าสิบ 7 ใบถูกนับเป็นส่วนที่เก็บไว้ ฿350', `฿${ex.kept}`)
check(ex.leftover === 3350, 'เหลือ = ชุด ฿3,000 + ห้าสิบที่มี ฿350', `฿${ex.leftover}`)

// นับได้ตรงชุดพอดี → ไม่ต้องทำอะไร
const h = planByDenom({ ...kit }, kit, NOTES)
check(h.taken === 0 && h.over === 0 && h.short === 0 && h.shortages.length === 0, 'นับได้ตรงชุดพอดี → ไม่หยิบ ไม่ขาด ไม่เกิน', show(h))

// ขาดหลายกอง → ไล่เรียงจากใบใหญ่ไปเล็ก
const i = planByDenom({ 100: 10, 20: 5, 1: 10 }, kit, NOTES)
check(
  i.shortages.map((x) => x.value).join(',') === '100,20,10,5,1',
  'เรียงกองที่ขาดจากใบใหญ่ไปเล็ก',
  i.shortages.map((x) => `${x.value}×${x.need}`).join(' '),
)
check(i.taken === 0, 'ไม่มีกองไหนเกินเป้า → ไม่หยิบออกเลย', `฿${i.taken}`)
check(i.short === 3000 - (1000 + 100 + 10), 'บอกว่าเงินทอนรวมขาดเท่าไหร่', `฿${i.short}`)

// ── ให้เจ้าของเท่าไหร่ คิดจากส่วนต่าง ไม่ใช่ช่องที่กรอกแยก ─────────────────────────────
// เดิมหน้าปิดกะมีช่อง "แยกให้เจ้าของ" ให้กรอกเอง ทำได้แค่ทางเดียวคือหยิบออก วันที่เงินทอนขาด
// แล้วเจ้าของเอามาเติมจึงไม่มีที่ลง · คิดจาก (ที่นับได้ − ที่เหลือไว้) แทนจึงได้สองทางในช่องเดียว
console.log('')

// วันปกติ: นับได้ทั้งเก๊ะ เหลือไว้ตามชุด ส่วนที่เหลือออกไปหาเจ้าของ
const keepPlan = planByDenom(real, kit, NOTES, SUGGESTED_KEEP)
const o1 = ownerSide(real, keepPlan.keep)
check(o1.net === keepPlan.taken, 'เหลือไว้ตามที่ระบบคิด → ให้เจ้าของเท่ากับที่แผนบอกเป๊ะ', `฿${o1.net} vs ฿${keepPlan.taken}`)
check(Object.keys(o1.add).length === 0, 'วันที่เงินเกิน ไม่มีใบไหนต้องเติมเข้า', JSON.stringify(o1.add))
check(o1.take[1000] === 3 && o1.take[500] === 2, 'ได้รายละเอียดใบที่หยิบออก (พัน 3 · ห้าร้อย 2)', JSON.stringify(o1.take))

// วันที่เงินทอนขาด แล้วเจ้าของเอามาเติมตอนปิดกะ — ใส่ "เหลือไว้" มากกว่าที่นับได้
const thin = { 100: 2, 20: 5, 10: 4, 5: 6, 1: 20 }
const o2 = ownerSide(thin, kit)
check(o2.net === -(3000 - (200 + 100 + 40 + 30 + 20)), 'เหลือไว้มากกว่าที่นับได้ → ยอดติดลบ = เจ้าของเติมเข้า', `฿${o2.net}`)
check(Object.keys(o2.take).length === 0, 'วันที่ขาด ไม่มีใบไหนถูกหยิบออก', JSON.stringify(o2.take))
check(o2.add[100] === 16 && o2.add[20] === 35, 'บอกว่าเจ้าของเติมใบไหนเข้ามากี่ใบ (ร้อย 16 · ยี่สิบ 35)', JSON.stringify(o2.add))

// เติมบางกอง หยิบบางกองในวันเดียวกัน — แลกแบงค์ร้อยเป็นยี่สิบคือเคสนี้
const o3 = ownerSide({ 100: 20, 20: 10, 1: 50 }, { 100: 15, 20: 40, 1: 50 })
check(o3.net === 500 - 600, 'หยิบร้อย 5 เติมยี่สิบ 30 → สุทธิเจ้าของเติมเข้า ฿100', `฿${o3.net}`)
check(o3.take[100] === 5 && o3.add[20] === 30, 'แยกฝั่งหยิบออก/เติมเข้าออกจากกันได้ในวันเดียวกัน', `${JSON.stringify(o3.take)} / ${JSON.stringify(o3.add)}`)
check(o3.signed[100] === 5 && o3.signed[20] === -30, 'signed เก็บทั้งสองทางด้วยเครื่องหมาย (ลงคอลัมน์ owner_denominations)', JSON.stringify(o3.signed))
check(!(1 in o3.signed), 'กองที่ไม่ขยับไม่ต้องโผล่ใน signed', JSON.stringify(o3.signed))

// เหลือไว้เท่าที่นับได้ = วันที่ไม่ได้ให้เจ้าของเลย (ค่าตั้งต้นของร้านที่ไม่ได้ตั้งชุดเงินทอน)
const o4 = ownerSide(real, real)
check(o4.net === 0 && !Object.keys(o4.signed).length, 'เหลือไว้ทั้งเก๊ะ → ให้เจ้าของ ฿0', `฿${o4.net}`)

console.log(`\nผ่าน ${passed} · ไม่ผ่าน ${failed}`)
if (failed) process.exit(1)
