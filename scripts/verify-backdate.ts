/**
 * ตรวจการคีย์บิลย้อนหลัง กับฐานข้อมูลจริง โดยไม่แตะข้อมูลของร้าน
 *
 *   npx tsx scripts/verify-backdate.ts
 *
 * ยิงตรรกะจริงจาก src/lib/backdate.ts แล้วลองเขียนบิลทดสอบจริงเพื่อดูว่า trigger
 * ฝั่ง DB (supabase-migration-backdate.sql) ติดธง recorded_at ให้เองและกันวันเพี้ยนจริง
 * บิลทดสอบทุกใบถูกลบทิ้งตอนจบ (รวมตอน error)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BACKDATE_MAX_DAYS, fallsBeforeShift, inputBounds, toInputValue, validateBackdate } from '../src/lib/backdate'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

let passed = 0
let failed = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (ok) passed++
  else failed++
}

const madeTx: string[] = []
async function cleanup() {
  for (const id of madeTx) await supabase.from('transactions').delete().eq('id', id)
  madeTx.length = 0
}

const DAY_MS = 86_400_000
const NOW = new Date('2026-10-30T15:00:00+07:00')

/** บิลเปล่า ๆ สำหรับทดสอบ — ไม่มีรายการ ไม่มีลูกค้า ไม่แตะสต็อก */
async function insertTx(txNumber: string, createdAt?: string, reason?: string) {
  return supabase
    .from('transactions')
    .insert({
      transaction_number: txNumber,
      subtotal: 1,
      total: 1,
      payment_method: 'cash',
      ...(createdAt ? { created_at: createdAt, backdate_reason: reason ?? 'ทดสอบ' } : {}),
    })
    .select('id, created_at, recorded_at, backdate_reason')
    .single()
}

async function main() {
  // --- 1) ตรรกะล้วน: ขอบเขตที่ให้คีย์ย้อนหลังได้
  check(validateBackdate('', NOW).ok === false, 'ไม่ใส่วันเวลา = ไม่ผ่าน')
  check(validateBackdate('ไม่ใช่วันที่', NOW).ok === false, 'วันเวลาพิมพ์มั่ว = ไม่ผ่าน')

  const future = validateBackdate(toInputValue(new Date(NOW.getTime() + 3 * 3600_000)), NOW)
  check(!future.ok && future.error.includes('ล่วงหน้า'), 'ลงวันขายล่วงหน้าไม่ได้')

  const tooOld = validateBackdate(toInputValue(new Date(NOW.getTime() - (BACKDATE_MAX_DAYS + 1) * DAY_MS)), NOW)
  check(!tooOld.ok, `เกิน ${BACKDATE_MAX_DAYS} วัน = ไม่ผ่าน`, tooOld.ok ? '' : tooOld.error)

  const justInside = validateBackdate(toInputValue(new Date(NOW.getTime() - (BACKDATE_MAX_DAYS * DAY_MS - 3600_000))), NOW)
  check(justInside.ok, `ย้อน ${BACKDATE_MAX_DAYS} วันพอดี (ลบ 1 ชม.) = ผ่าน`)

  const hourAgo = validateBackdate(toInputValue(new Date(NOW.getTime() - 3600_000)), NOW)
  check(hourAgo.ok && !hourAgo.negligible, 'ย้อน 1 ชั่วโมง = เป็นบิลย้อนหลังจริง')

  const now = validateBackdate(toInputValue(NOW), NOW)
  check(now.ok && now.negligible, 'เลือกเวลาปัจจุบัน = ไม่นับเป็นบิลย้อนหลัง')

  // ช่วงในช่องกรอกต้องครอบ 7 วันที่ผ่านมา และไม่เลยปัจจุบัน
  const bounds = inputBounds(NOW)
  check(bounds.max === toInputValue(NOW), 'ช่องกรอกเลือกได้ไม่เกินเวลาปัจจุบัน', bounds.max)
  check(bounds.min === toInputValue(new Date(NOW.getTime() - BACKDATE_MAX_DAYS * DAY_MS)), 'ช่องกรอกย้อนได้ถึง 7 วัน', bounds.min)

  // --- 2) เตือนบิลที่ขายก่อนเปิดกะ
  const shiftOpenedAt = new Date(NOW.getTime() - 4 * 3600_000).toISOString()
  check(fallsBeforeShift(new Date(NOW.getTime() - 6 * 3600_000), shiftOpenedAt), 'ขายก่อนเปิดกะ = เตือน')
  check(!fallsBeforeShift(new Date(NOW.getTime() - 2 * 3600_000), shiftOpenedAt), 'ขายหลังเปิดกะ = ไม่เตือน')
  check(!fallsBeforeShift(new Date(NOW.getTime() - 6 * 3600_000), null), 'ไม่มีกะเปิด = ไม่มีอะไรให้เตือน')

  // --- 3) เลขที่บิลต้องเป็นของวันที่ขาย ไม่ใช่วันที่คีย์
  const yesterday = new Date(Date.now() - DAY_MS)
  const { data: numBack, error: numErr } = await supabase.rpc('next_transaction_number', { p_at: yesterday.toISOString() })
  if (numErr) {
    check(false, 'เรียก next_transaction_number(p_at) ได้', `${numErr.message} — ยังไม่ได้รัน supabase-migration-backdate.sql?`)
    return
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const bkk = new Date(yesterday.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }))
  const wantPrefix = `RC${pad(bkk.getDate())}${pad(bkk.getMonth() + 1)}${bkk.getFullYear()}`
  check(String(numBack).startsWith(wantPrefix), 'เลขที่บิลย้อนหลังใช้วันที่ขาย', `${numBack} ขึ้นต้นด้วย ${wantPrefix}`)

  const { data: numNow } = await supabase.rpc('next_transaction_number')
  check(typeof numNow === 'string' && numNow.startsWith('RC'), 'เรียกเปล่า ๆ ยังได้เลขของวันนี้เหมือนเดิม', String(numNow))

  // --- 4) trigger ติดธง recorded_at ให้เอง
  const stamp = Date.now()
  const soldAt = new Date(Date.now() - 3 * 3600_000).toISOString()
  const { data: back, error: backErr } = await insertTx(`ZZTEST${stamp}1`, soldAt, 'เน็ตล่ม')
  if (back) madeTx.push(back.id)
  check(!backErr && Boolean(back?.recorded_at), 'บิลย้อนหลังได้ recorded_at อัตโนมัติ', backErr?.message ?? String(back?.recorded_at))
  check(back?.created_at?.slice(0, 16) === soldAt.slice(0, 16), 'created_at เก็บเวลาที่ขายจริงไว้ตามที่ส่งไป')
  check(back?.backdate_reason === 'เน็ตล่ม', 'เก็บเหตุผลที่คีย์ย้อนหลัง')

  const { data: plain, error: plainErr } = await insertTx(`ZZTEST${stamp}2`)
  if (plain) madeTx.push(plain.id)
  check(!plainErr && plain?.recorded_at === null, 'บิลปกติ recorded_at เป็น null', plainErr?.message ?? '')

  // ส่ง recorded_at/backdate_reason มาเองกับบิลที่ไม่ได้ย้อนวัน — trigger ต้องล้างทิ้ง ปลอมธงไม่ได้
  const { data: faked } = await supabase
    .from('transactions')
    .insert({
      transaction_number: `ZZTEST${stamp}3`,
      subtotal: 1, total: 1, payment_method: 'cash',
      recorded_at: new Date(Date.now() - 9 * DAY_MS).toISOString(),
      backdate_reason: 'ปลอม',
    })
    .select('id, recorded_at, backdate_reason')
    .single()
  if (faked) madeTx.push(faked.id)
  check(faked?.recorded_at === null && faked?.backdate_reason === null, 'ปลอมธงย้อนหลังไม่ได้ — trigger ล้างให้เป็น null')

  // --- 5) trigger กันวันเพี้ยน
  const { error: futureErr } = await insertTx(`ZZTEST${stamp}4`, new Date(Date.now() + 2 * 3600_000).toISOString())
  check(Boolean(futureErr), 'DB ปฏิเสธวันขายล่วงหน้า', futureErr?.message ?? 'ไม่ error!')

  const { error: oldErr } = await insertTx(`ZZTEST${stamp}5`, new Date(Date.now() - 30 * DAY_MS).toISOString())
  check(Boolean(oldErr), `DB ปฏิเสธบิลเก่ากว่า ${BACKDATE_MAX_DAYS} วัน`, oldErr?.message ?? 'ไม่ error!')

  await cleanup()
  const { data: leftovers } = await supabase.from('transactions').select('id').like('transaction_number', 'ZZTEST%')
  check((leftovers ?? []).length === 0, 'ลบบิลทดสอบหมดแล้ว ไม่มีบิลค้าง')

  console.log(`\nผ่าน ${passed} · ไม่ผ่าน ${failed}`)
}

main()
  .catch(async (e) => { console.error(e); await cleanup(); process.exit(1) })
  .then(async () => { await cleanup() })
