/**
 * ตรวจการคิดเงินทอนตั้งต้นคงที่ — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 *
 *   npx tsx scripts/verify-shift-float.ts
 *
 * โจทย์: ปิดกะแล้วต้องแยกแบงค์ไหนออกให้เจ้าของบ้าง ถึงจะเหลือในลิ้นชักเท่าเงินทอนตั้งต้นพอดี
 * และเหรียญ/แบงค์เล็กต้องไม่ถูกหยิบออก เพราะนั่นคือเงินทอนที่ต้องใช้เปิดร้านเช้าวันถัดไป
 */
import { coverFloat, floatSetKeep, ownerSide, planByDenom, planOwnerTake, planSwap, SUGGESTED_FLOAT, SUGGESTED_KEEP, type FloatPlan } from '../src/lib/shiftFloat'

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

// ── โยกทั้งชุด: รวบของเก่าออกทั้งกอง วางชุดใหม่ลงไป ────────────────────────────────────
// ของจริงที่ร้านใช้: ชุด ฿4,000 (ห้าร้อย 2 · ร้อย 18 · ยี่สิบ 40 · สิบ 20 · ห้า 30 · บาท 50)
// แบงค์ห้าสิบเก็บไว้ทั้งหมด เตรียมใส่ชุดใหม่ไม่ได้ (แลกจากธนาคารมาไม่ได้)
console.log('')
const set4000 = { 500: 2, 100: 18, 20: 40, 10: 20, 5: 30, 1: 50 }
const sw = planSwap(real, set4000, SUGGESTED_KEEP)

check(sw.putTotal === 4000, 'ชุดใหม่ที่วางลงเก๊ะ ฿4,000 เท่าที่ตั้งไว้', `฿${sw.putTotal}`)
check(sw.outTotal === realTotal - 50, 'รวบออกทุกกองยกเว้นแบงค์ห้าสิบ', `฿${sw.outTotal} (นับได้ ฿${realTotal} − ห้าสิบ ฿50)`)
check(!(50 in sw.out) && sw.stay[50] === 1, 'แบงค์ห้าสิบคาอยู่ในเก๊ะ ไม่ถูกรวบออก', JSON.stringify(sw.stay))
check(sw.leftover === 4050, 'เช้ามาเปิดด้วยชุดใหม่ + ห้าสิบที่คาไว้ ฿4,050', `฿${sw.leftover}`)
check(sw.net === sw.outTotal - sw.putTotal, 'สุทธิที่เจ้าของได้ = รวบออก − วางใหม่', `฿${sw.net}`)

// ข้อสำคัญที่สุด — โยกทั้งชุดกับคืนส่วนเกินต้องได้เงินสุทธิเท่ากัน ไม่ใช่วิธีใหม่แล้วเงินหาย/เกิน
const byDenom = planByDenom(real, set4000, NOTES, SUGGESTED_KEEP)
check(
  sw.net === ownerSide(real, sw.keep).net,
  'สุทธิตรงกับที่หน้าปิดกะคิดจากส่วนต่าง (ที่นับได้ − ที่เหลือไว้)',
  `฿${sw.net}`,
)
check(
  sw.leftover !== byDenom.leftover || sw.net === byDenom.taken,
  'เหลือในเก๊ะเท่ากันเมื่อไหร่ เงินที่ออกไปก็เท่ากันเมื่อนั้น',
  `โยกชุด เหลือ ฿${sw.leftover} ออก ฿${sw.net} · ส่วนเกิน เหลือ ฿${byDenom.leftover} ออก ฿${byDenom.taken}`,
)
check(
  sw.leftover === 4000 + 50 * (real[50] ?? 0),
  'เหลือในเก๊ะไม่ลอยตามที่นับได้ — ชุดใหม่คงที่ + ห้าสิบที่รับมาจากลูกค้า',
  `฿${sw.leftover}`,
)

// วันที่เงินในเก๊ะน้อยกว่าชุดใหม่ — เจ้าของวางเพิ่มเข้าไป ไม่ใช่ติดลบแล้วพัง
const swThin = planSwap({ 100: 2, 20: 5, 10: 4, 5: 6, 1: 20 }, set4000, SUGGESTED_KEEP)
check(swThin.net === 390 - 4000, 'รวบออกได้น้อยกว่าชุดใหม่ → สุทธิติดลบ = เจ้าของวางเพิ่ม', `฿${swThin.net}`)
check(swThin.leftover === 4000, 'ยังเปิดร้านด้วยเงินทอนครบชุด ไม่มีกองไหนขาด', `฿${swThin.leftover}`)

// กองที่เก็บไว้ทั้งหมดต้องไม่โผล่ในชุดใหม่ แม้คนตั้งค่าจะใส่เลขไว้
const swOdd = planSwap({ 50: 4 }, { ...set4000, 50: 10 }, [50])
check(!(50 in swOdd.put) && swOdd.keep[50] === 4, 'ตั้งเป้าแบงค์ห้าสิบไว้ก็ไม่เตรียมใส่ชุดใหม่ ใช้ที่มีในเก๊ะ', JSON.stringify(swOdd.keep))

// ไม่มีกองไหนเก็บไว้ทั้งหมด = รวบออกหมดเก๊ะจริง ๆ
const swAll = planSwap(real, set4000, [])
check(swAll.outTotal === realTotal && swAll.leftover === 4000, 'ไม่ตั้งกองที่เก็บไว้ → รวบออกทั้งเก๊ะ เหลือเท่าชุดใหม่พอดี', `฿${swAll.outTotal} / ฿${swAll.leftover}`)

// ── ใบเล็กแทนใบใหญ่: ห้าร้อยไม่พอ ใช้แบงค์ร้อยแทน ────────────────────────────────────
// ชุดจริงของร้าน ฿4,000 มีห้าร้อย 2 ใบอยู่ด้วย แต่ห้าร้อยไม่ได้มีทุกคืน
console.log('')
const noteSet = { 500: 2, 100: 18, 20: 40, 10: 20, 5: 30, 1: 50 }
const coins = { 10: 20, 5: 30, 1: 50 }

// ใส่ร้อย 28 ใบแทนห้าร้อย 2 ใบ — ยอดเท่ากัน ทอนได้ละเอียดกว่า ต้องไม่ขึ้นว่าขาด
const subbed = { 100: 28, 20: 40, ...coins }
const cs = coverFloat(subbed, noteSet, SUGGESTED_KEEP)
check(cs.ok && cs.missing === 0, 'ร้อย 28 ใบแทนห้าร้อย 2 ใบ → ครบชุด ไม่ขึ้นว่าขาด', `ขาด ฿${cs.missing}`)
check(cs.piles[500].substituted === 1000, 'บอกได้ว่ากองห้าร้อยถูกใบเล็กอุดไว้ ฿1,000', `฿${cs.piles[500].substituted}`)
check(cs.shortages.length === 0, 'ไม่มีกองไหนค้างอยู่ในรายการที่ต้องแลกมาเติม', JSON.stringify(cs.shortages))

// ย้อนทางไม่ได้ — ห้าร้อยเกินมาอุดยี่สิบที่ขาดไม่ได้ เพราะแตกไม่ได้
const big = { 500: 4, 100: 18, 20: 0, ...coins }
const cb = coverFloat(big, noteSet, SUGGESTED_KEEP)
check(cb.piles[20].missing === 800, 'ห้าร้อยเกินมา ฿1,000 ก็อุดยี่สิบที่ขาด ฿800 ไม่ได้', `ขาด ฿${cb.piles[20].missing}`)
check(cb.shortages.length === 1 && cb.shortages[0].value === 20, 'เตือนแต่กองยี่สิบกองเดียว', JSON.stringify(cb.shortages))
check(cb.shortages[0].need === 40, 'บอกเป็นจำนวนใบด้วย — ยี่สิบอีก 40 ใบ', `${cb.shortages[0].need} ใบ`)

// แบงค์กับเหรียญไม่ยกข้ามกัน — ทอนร้อยเป็นเหรียญบาทร้อยเหรียญไม่มีใครทำ
const coinHeavy = { 500: 2, 100: 17, 20: 40, 10: 20, 5: 30, 1: 500 }
const cc = coverFloat(coinHeavy, noteSet, SUGGESTED_KEEP)
check(cc.piles[100].missing === 100, 'เหรียญบาทเกิน ฿450 ไม่นับว่าอุดแบงค์ร้อยที่ขาด 1 ใบ', `ขาด ฿${cc.piles[100].missing}`)
const noteHeavy = { 500: 2, 100: 30, 20: 40, 10: 20, 5: 30, 1: 0 }
const cn = coverFloat(noteHeavy, noteSet, SUGGESTED_KEEP)
check(cn.piles[1].missing === 50, 'แบงค์ร้อยเกิน ฿1,200 ก็แตกเป็นเหรียญบาทเองไม่ได้', `ขาด ฿${cn.piles[1].missing}`)

// แบงค์ห้าสิบไม่อยู่ในสมการทั้งขาซัพพลายและขาเป้า
const withFifties = { 50: 20, 100: 18, 20: 40, ...coins }
const cf = coverFloat(withFifties, noteSet, SUGGESTED_KEEP)
check(cf.piles[500].missing === 1000, 'ห้าสิบ 20 ใบที่คาไว้ไม่นับว่าอุดห้าร้อยที่ขาด', `ขาด ฿${cf.piles[500].missing}`)
check(!(50 in cf.piles), 'กองที่เก็บไว้ทั้งหมดไม่โผล่ในผลเทียบเลย', JSON.stringify(Object.keys(cf.piles)))

// ── ค่าตั้งต้นหน้าปิดกะ = ชุดที่เจ้าของเตรียมไว้ (floatSetKeep) ──────────────────────────
// เงินทอนไม่ได้จัดจากเงินที่มีในเก๊ะอีกแล้ว เจ้าของนับชุด ฿4,000 เตรียมไว้ล่วงหน้าทุกวัน
// ไม่รวมแบงค์ห้าสิบ (19 พ.ย. 69) ปิดกะจึงต้องเข้าโหมด "โยกทั้งชุด" ทุกคืนไม่ว่าเก๊ะจะมีอะไรอยู่
// ไม่มีเรื่องขาด/เติม/ต้องแลกมาเติมให้อ่านอีก — นั่นคือหน้าตาของสมัยที่เงินทอนคือ "เหลือไว้เท่าที่มี"
console.log('')
const setValue = (k: Record<number, number>) =>
  Object.entries(k).reduce((sum, [v, q]) => sum + Number(v) * q, 0) - 50 * (k[50] ?? 0)
/** เงื่อนไขที่หน้าปิดกะใช้ตัดสินว่าคืนนี้เป็นการโยกทั้งชุด (ดู ShiftClient → swapping) */
const swaps = (counts: Record<number, number>, keep: Record<number, number>) =>
  SUGGESTED_KEEP.every((d) => (keep[d] ?? 0) === (counts[d] ?? 0)) &&
  setValue(keep) === setValue(noteSet) &&
  coverFloat(keep, noteSet, SUGGESTED_KEEP).ok

// คืนธรรมดา — เก๊ะมีทุกอย่างพอ
const drawer = { 1000: 3, 100: 40, 50: 2, 20: 60, 10: 25, 5: 40, 1: 80 }
const k1 = floatSetKeep(drawer, noteSet, SUGGESTED_KEEP)
check(setValue(k1) === 4000, 'เหลือไว้เท่าชุดที่ตั้งไว้พอดี ฿4,000', `฿${setValue(k1)}`)
check(k1[500] === 2 && k1[100] === 18 && k1[20] === 40 && k1[10] === 20 && k1[5] === 30 && k1[1] === 50, 'ทุกกองลงเท่าชุดที่ตั้งไว้เป๊ะ', JSON.stringify(k1))
check(!k1[1000], 'แบงค์พันไม่อยู่ในชุด — ออกไปหาเจ้าของทั้งหมด', String(k1[1000] ?? 0))
check(k1[50] === 2, 'ห้าสิบคาไว้ในเก๊ะตามที่นับได้', String(k1[50]))
check(swaps(drawer, k1), 'หน้าปิดกะเข้าโหมดโยกทั้งชุด', '')

// คืนที่เก๊ะไม่มีห้าร้อย/ของเล็กไม่พอ — ชุดที่วางลงยังเป็นชุดเดิม เพราะเจ้าของถือมาเอง
const thinDrawer = { 1000: 4, 100: 5, 20: 10, 50: 2, 1: 20 }
const k2 = floatSetKeep(thinDrawer, noteSet, SUGGESTED_KEEP)
check(setValue(k2) === 4000, 'เก๊ะไม่มีของก็ยังวางชุด ฿4,000 ที่เตรียมมา', `฿${setValue(k2)}`)
check(k2[500] === 2 && k2[100] === 18, 'ไม่ไปจัดชุดใหม่จากเงินในเก๊ะแทน', JSON.stringify(k2))
check(swaps(thinDrawer, k2), 'คืนที่เก๊ะบางก็ยังเป็นการโยกทั้งชุด ไม่ขึ้นว่าขาด', '')
check(coverFloat(k2, noteSet, SUGGESTED_KEEP).shortages.length === 0, 'ไม่มีรายการ "ต้องแลกมาเติมก่อนเปิดร้าน" ให้อ่าน', JSON.stringify(coverFloat(k2, noteSet, SUGGESTED_KEEP).shortages))

// ไม่มีห้าสิบเลยคืนนั้น — กองนั้นว่างไป ไม่ใช่ขึ้นว่าขาด
const k3 = floatSetKeep({ 500: 5, 100: 30, 20: 60, 10: 25, 5: 40, 1: 80 }, noteSet, SUGGESTED_KEEP)
check(!k3[50], 'ไม่มีห้าสิบในเก๊ะ → กองห้าสิบว่าง ไม่ต้องไปหามาใส่', String(k3[50] ?? 0))

// คำสั่งที่เก๊ะ + เงินสุทธิที่ออกไปหาเจ้าของ
const sw1 = planSwap(drawer, k1, SUGGESTED_KEEP)
check(sw1.putTotal === 4000, 'วางชุดใหม่ลงเก๊ะ ฿4,000', `฿${sw1.putTotal}`)
check(sw1.outTotal === 3000 + 4000 + 1200 + 250 + 200 + 80, 'รวบออกทั้งเก๊ะยกเว้นห้าสิบ', `฿${sw1.outTotal}`)
check(sw1.leftover === 4100, 'เช้าพรุ่งนี้เปิดด้วยชุด ฿4,000 + ห้าสิบ 2 ใบ', `฿${sw1.leftover}`)
check(sw1.net === ownerSide(drawer, k1).net, 'สุทธิที่เจ้าของได้ตรงกับส่วนต่างใบนับ', `฿${sw1.net}`)

// วันที่ขายน้อยจนเงินในเก๊ะไม่ถึงชุด — เจ้าของวางเพิ่ม ไม่ใช่ "พนักงานต้องไปแลกมาเติม"
const poorDrawer = { 100: 5, 20: 10, 50: 2, 1: 20 }
const sw2 = planSwap(poorDrawer, floatSetKeep(poorDrawer, noteSet, SUGGESTED_KEEP), SUGGESTED_KEEP)
check(sw2.net === 720 - 4000, 'เงินในเก๊ะน้อยกว่าชุด → ขึ้นว่าเจ้าของวางเพิ่มสุทธิ ฿3,280', `฿${sw2.net}`)
check(sw2.leftover === 4100, 'เช้าพรุ่งนี้ยังเปิดด้วย ฿4,100 เท่าเดิม', `฿${sw2.leftover}`)

console.log(`\nผ่าน ${passed} · ไม่ผ่าน ${failed}`)
if (failed) process.exit(1)
