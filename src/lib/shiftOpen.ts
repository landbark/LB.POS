// เปิดกะ — ใช้ร่วมกันระหว่างหน้า "ปิดกะ/เงินสด" กับแถบเตือน "ยังไม่ได้เปิดกะ" ในหน้าขาย
//
// สูตร "เงินที่ควรมีในเก๊ะ" นับบิลตามเวลา (`created_at >= shifts.opened_at`) บิลที่ขายตอนไม่มีกะ
// เปิดจึงตกนอกกะทุกกะ เงินอยู่ในเก๊ะแต่ไม่มีใครนับ ตอนปิดกะจะขึ้นว่า "เงินเกิน" เท่ายอดนั้นแล้ว
// กลบเงินขาดจริง/เงินที่หยิบไปใช้โดยไม่ได้ลงบันทึกไปด้วย — เปิดกะทีหลังจึงเสนอย้อนเวลาเปิดกะ
// ไปที่บิลแรกของช่วงที่ไม่มีกะ ให้บิลพวกนั้นกลับเข้ามาอยู่ในกะ
//
// ช่อง "เงินสดตั้งต้น" เคยเป็นช่องว่างให้พิมพ์เอง เงินที่เหลือข้ามคืนจากกะที่แล้วจึงไม่มีใครเทียบ
// พิมพ์ผิดไป 8 ใน 20 กะ (ตั้งแต่ -3,000 ถึง +7,146) และทุกครั้งส่วนต่างหายเงียบ ไม่รู้ว่าคืนก่อน
// นับผิดหรือเงินหายระหว่างคืน (เจอ 2026-10-28: ยกมา 3,439 แต่เช้านับได้ 3,454 เกิน 15 เงียบๆ)
// ตอนนี้จึงเติมยอดยกมาให้ก่อน แล้วถ้าคนนับได้ไม่เท่ากันก็ยังแก้ได้ แต่ส่วนต่างถูกเขียนลง `notes`

import { createClient } from '@/lib/supabase/client'
import { sumByMethod, type PaidTransaction } from '@/lib/payments'
import { DENOMS } from '@/lib/shiftFloat'
import { thaiDayRange } from '@/lib/thaiDate'

/** ใช้ client ของเบราว์เซอร์เป็นค่าเริ่มต้น — สคริปต์ทดสอบส่ง client ของ service role เข้ามาแทนได้ */
type Db = Pick<ReturnType<typeof createClient>, 'from'>

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })

export interface OrphanSales {
  /** เวลาบิลแรกของช่วงที่ไม่มีกะ — ใช้เป็น `opened_at` ถ้าเลือกรวมเข้ากะ */
  firstAt: string
  /** บิลหน้าร้านในช่วงนั้นทั้งหมด (ทุกวิธีจ่าย) */
  bills: number
  /** เงินสดที่รับไว้ — ก้อนที่ทำให้ยอดปิดกะไม่ตรงกับเงินในเก๊ะ */
  cash: number
}

/**
 * บิลขายหน้าร้านของวันนี้ (เวลาไทย) ที่ขายไปตอนไม่มีกะเปิด — ไม่มีเงินสดเลยคืน null
 * เงินสดเท่านั้นที่มีผลกับเก๊ะ บิลโอน/บัตรไม่เตือน แต่ถ้ามีเงินสดจะนับบิลรวมมาด้วยเพื่อ
 * ให้กะครอบช่วงที่ขายจริงทั้งช่วง (ยอดแยกวิธีจ่ายในสรุปกะจะตรงกับที่ขายไป)
 */
export async function findOrphanSales(supabase: Db = createClient()): Promise<OrphanSales | null> {
  const { startISO, endISO } = thaiDayRange()

  // บิลก่อนกะล่าสุดที่ปิดไปแล้วถูกนับในกะนั้นเรียบร้อย เริ่มนับจากเวลาที่กะล่าสุดปิด (ถ้าปิดวันนี้)
  const { data: last } = await supabase
    .from('shifts')
    .select('closed_at')
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const from = last?.closed_at && last.closed_at > startISO ? last.closed_at : startISO

  // บูธ/ออนไลน์ไม่ใช่เงินในเก๊ะร้าน — สูตรของกะก็กรองเหลือ 'store' เหมือนกัน
  const { data, error } = await supabase
    .from('transactions')
    .select('created_at, total, payment_method, transaction_payments(method, amount)')
    .eq('status', 'completed')
    .eq('sales_channel', 'store')
    .gte('created_at', from)
    .lt('created_at', endISO)
    .order('created_at')
  if (error) return null

  const bills = (data ?? []) as unknown as (PaidTransaction & { created_at: string })[]
  if (bills.length === 0) return null
  const cash = sumByMethod(bills).cash ?? 0
  if (cash <= 0) return null
  return { firstAt: bills[0].created_at, bills: bills.length, cash }
}

/** ข้อความ audit ที่เขียนลง `shifts.notes` ตอนย้อนเวลาเปิดกะ (รูปแบบเดียวกับการแก้ยอดย้อนหลัง) */
export function orphanNote(orphan: OrphanSales, byName: string) {
  const stamp = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
  return `[รวมบิลก่อนเปิดกะ ${stamp} โดย ${byName || 'พนักงาน'}] ย้อนเวลาเปิดกะไปที่ ${fmtTime(orphan.firstAt)} · บิลหน้าร้าน ${orphan.bills} ใบ เงินสด ฿${money(orphan.cash)}`
}

export interface CarryOver {
  /** เงินที่ต้องเหลือข้ามคืนในเก๊ะ = ที่นับได้ตอนปิดกะที่แล้ว − ที่แยกให้เจ้าของ */
  amount: number
  /** ยอดที่นับได้ตอนปิดกะที่แล้ว */
  counted: number
  /** ยอดที่แยกออกให้เจ้าของตอนปิด (วันไหนเจ้าของไม่อยู่ = 0) */
  toOwner: number
  closedAt: string
  /** จำนวนใบ/เหรียญที่ควรเหลือข้ามคืน · null = กะที่แล้วไม่ได้นับแยก */
  denoms: Record<number, number> | null
  /** เจ้าของมาจัดเงินทอนหลังปิดกะเมื่อไหร่ · null = ยังไม่ได้จัด (ยกใบนับตอนปิดมาตรง ๆ) */
  adjustedAt: string | null
}

/**
 * เงินที่ควรเหลือในเก๊ะจากกะที่ปิดไปล่าสุด — ใช้เติมช่อง "เงินสดตั้งต้น" ให้ล่วงหน้า
 * กะที่ปิดโดยไม่ได้นับเงิน (`closing_cash_counted` ว่าง) เทียบไม่ได้ คืน null
 */
export async function findCarryOver(supabase: Db = createClient()): Promise<CarryOver | null> {
  const lastClosed = (cols: string) =>
    supabase
      .from('shifts')
      .select(cols)
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

  const full = 'closed_at, closing_cash_counted, cash_to_owner, closing_denominations, owner_denominations, carry_denominations, carry_adjusted_at'
  const first = await lastClosed(full)
  let data = first.data
  // ยังไม่ได้รัน migration จัดเงินทอนหลังปิดกะ — ยอดยกมาต้องยังทำงาน แค่ไม่มีส่วนที่เจ้าของจัด
  if (first.error && first.error.message.includes('carry_')) {
    ;({ data } = await lastClosed('closed_at, closing_cash_counted, cash_to_owner, closing_denominations, owner_denominations'))
  }
  const row = data as Record<string, unknown> | null
  if (!row || row.closing_cash_counted == null) return null
  const counted = Number(row.closing_cash_counted)
  // ติดลบได้ตั้งแต่ที่หน้าปิดกะเปลี่ยนมาคิด "ให้เจ้าของ" จากส่วนต่าง — ลบคือเจ้าของเติมเงินทอนเข้าเก๊ะ
  const toOwner = Number(row.cash_to_owner ?? 0)
  const closing = row.closing_denominations as Record<string, number> | null
  const owner = (row.owner_denominations ?? {}) as Record<string, number>
  // เจ้าของมาจัดเงินทอนหลังปิดกะแล้ว → ใบนับหลังจัดคือของจริงที่รอเช้าวันรุ่งขึ้นอยู่
  const adjusted = (row.carry_denominations ?? null) as Record<string, number> | null
  const denoms = adjusted
    ? Object.fromEntries(DENOMS.map((d) => [d.value, adjusted[d.value] ?? 0]))
    : closing
      ? Object.fromEntries(DENOMS.map((d) => [d.value, (closing[d.value] ?? 0) - (owner[d.value] ?? 0)]))
      : null
  const amount = adjusted
    ? DENOMS.reduce((sum, d) => sum + d.value * (adjusted[d.value] ?? 0), 0)
    : counted - toOwner
  return {
    amount, counted, toOwner, denoms,
    closedAt: row.closed_at as string,
    adjustedAt: (row.carry_adjusted_at as string | null) ?? null,
  }
}

/** กองที่นับได้เช้านี้ไม่ตรงกับที่กะที่แล้วเหลือไว้ — ตัวที่บอกว่าคืนก่อนนับผิดกองไหน */
export function denomDiffs(carry: CarryOver, counted: Record<number, number> | null) {
  if (!carry.denoms || !counted) return []
  return DENOMS.filter((d) => (counted[d.value] ?? 0) !== (carry.denoms![d.value] ?? 0)).map((d) => ({
    value: d.value,
    label: d.label,
    was: carry.denoms![d.value] ?? 0,
    now: counted[d.value] ?? 0,
  }))
}

/**
 * ข้อความ audit ตอนเงินที่นับได้เช้านี้ไม่เท่ายอดยกมา — เขียนลง `shifts.notes`
 * ส่วนต่างตรงนี้คือเงินที่หายหรือเกินระหว่างปิดกะเมื่อวานกับเปิดกะวันนี้ ต้องมีหลักฐานไว้
 */
export function carryNote(
  carry: CarryOver,
  openingCash: number,
  byName: string,
  reason = '',
  counted: Record<number, number> | null = null,
) {
  const diff = openingCash - carry.amount
  const diffs = denomDiffs(carry, counted)
  const stamp = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
  return (
    `[เงินตั้งต้นไม่ตรงยอดยกมา ${stamp} โดย ${byName || 'พนักงาน'}] ` +
    `ยกมา ฿${money(carry.amount)} (ปิดกะ ${fmtTime(carry.closedAt)} นับได้ ฿${money(carry.counted)}` +
    `${carry.toOwner > 0 ? ` − แยกให้เจ้าของ ฿${money(carry.toOwner)}` : ''}` +
    `${carry.toOwner < 0 ? ` + เจ้าของเติมเข้า ฿${money(-carry.toOwner)}` : ''}) · ` +
    `เช้านี้นับได้ ฿${money(openingCash)} · ${diff > 0 ? 'เกิน' : 'ขาด'} ฿${money(Math.abs(diff))}` +
    `${diffs.length ? ` · กองที่ไม่ตรง: ${diffs.map((x) => `${x.label} ${x.was}→${x.now}`).join(' · ')}` : ''}` +
    `${reason.trim() ? ` · ${reason.trim()}` : ''}`
  )
}

/**
 * เปิดกะใหม่ — ส่ง `orphan` มาด้วยถ้าจะรวมบิลที่ขายก่อนเปิดกะ (ย้อน `opened_at` ไปที่บิลแรก)
 * คืน error เป็นข้อความไทยพร้อมโชว์ ไม่โยน throw
 */
export async function openShift(
  opts: {
    openingCash: number
    openedBy: string
    openedByName?: string
    orphan?: OrphanSales | null
    /** ยอดยกมาจากกะที่แล้ว — ส่งมาด้วยเพื่อบันทึกส่วนต่างถ้านับได้ไม่เท่ากัน */
    carry?: CarryOver | null
    /** เหตุผลที่คนเปิดกะกรอกไว้ตอนนับได้ไม่ตรงยอดยกมา */
    carryReason?: string
    /** จำนวนใบ/เหรียญที่นับได้ตอนเปิดกะ — ไม่ส่งมา = เปิดกะแบบใส่ยอดรวมอย่างเดียว */
    openingDenoms?: Record<number, number> | null
  },
  supabase: Db = createClient(),
): Promise<{ error?: string }> {
  const row: Record<string, unknown> = {
    opening_cash: opts.openingCash,
    opened_by: opts.openedBy,
  }
  if (opts.openingDenoms) row.opening_denominations = opts.openingDenoms
  const notes: string[] = []
  if (opts.orphan) {
    row.opened_at = opts.orphan.firstAt
    notes.push(orphanNote(opts.orphan, opts.openedByName ?? ''))
  }
  if (opts.carry && opts.carry.amount !== opts.openingCash) {
    notes.push(carryNote(
      opts.carry, opts.openingCash, opts.openedByName ?? '', opts.carryReason, opts.openingDenoms ?? null,
    ))
  }
  if (notes.length) row.notes = notes.join('\n')
  let { error } = await supabase.from('shifts').insert(row)
  // ยังไม่ได้รัน migration ใบนับเปิดกะ — เปิดกะต้องไม่พังเพราะคอลัมน์เสริมที่ยังไม่มี
  // (deploy ขึ้นก่อนรัน SQL แล้วเช้ามาเปิดกะไม่ได้ = ขายไม่ได้ทั้งวัน)
  if (error && row.opening_denominations && error.message.includes('opening_denominations')) {
    delete row.opening_denominations
    ;({ error } = await supabase.from('shifts').insert(row))
  }
  if (error) return { error: error.code === '23505' ? 'มีกะที่เปิดอยู่แล้ว' : 'เปิดกะไม่สำเร็จ: ' + error.message }
  return {}
}
