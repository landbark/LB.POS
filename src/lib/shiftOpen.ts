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
import { splitShiftBills, type ShiftBill } from '@/lib/shiftCash'
import { DENOMS } from '@/lib/shiftFloat'
import { thaiDayRange } from '@/lib/thaiDate'

/** ใช้ client ของเบราว์เซอร์เป็นค่าเริ่มต้น — สคริปต์ทดสอบส่ง client ของ service role เข้ามาแทนได้ */
type Db = Pick<ReturnType<typeof createClient>, 'from'>

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
/** เวลาพร้อมวันที่ถ้าไม่ใช่วันนี้ — บิลหลังปิดกะอยู่คนละวันกับเช้าที่มาเปิดกะ เขียนเวลาเปล่าแล้วอ่านผิด */
const fmtWhen = (iso: string) => {
  const day = (d: Date | string) =>
    new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  return day(iso) === day(new Date())
    ? fmtTime(iso)
    : new Date(iso).toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
}

export interface OrphanSales {
  /** เวลาบิลแรกของช่วงที่ไม่มีกะ — ใช้เป็น `opened_at` ถ้าเลือกรวมเข้ากะ */
  firstAt: string
  /** เวลาบิลสุดท้าย — โชว์ช่วงเวลาให้คนเปิดกะเห็นว่าขายกันตอนไหน */
  lastAt: string
  /** บิลหน้าร้านที่ยังไม่ถูกยกเลิกในช่วงนั้น (ทุกวิธีจ่าย) */
  bills: number
  /** เงินสดที่รับไว้ทั้งช่วง — รวมบิลที่ยกเลิกทีหลังด้วย เงินเข้าเก๊ะไปแล้วตอนขาย */
  cash: number
  /** เงินสดที่คืนลูกค้าในช่วงนั้น — ออกจากเก๊ะไปแล้ว */
  refunds: number
  /** เงินสดสุทธิที่ตอนนี้อยู่ในเก๊ะเพราะช่วงนี้ = cash − refunds (ติดลบได้ถ้าคืนมากกว่าขาย) */
  net: number
  /** จุดเริ่มของช่วง = เวลาปิดกะที่แล้ว หรือต้นวันไทยถ้ายังไม่เคยปิดกะ */
  since: string
  /** ช่วงนี้เริ่มจากตอนปิดกะที่แล้วจริง ๆ = บิลพวกนี้คือ "ขายหลังปิดกะ" */
  afterClose: boolean
  /** บิลแรกเก่ากี่ชั่วโมงแล้ว — เกิน 36 ชม. หน้าเปิดกะจะไม่ติ๊กรวมให้เอง */
  hours: number
}

/**
 * บิลขายหน้าร้านที่ยังไม่อยู่ในกะไหนเลย — ขายหลังปิดกะเมื่อคืน หรือขายไปแล้วตอนยังไม่เปิดกะวันนี้
 * ไม่มีเงินสดขยับเลยคืน null
 *
 * ช่วงที่นับเริ่มจาก "เวลาที่กะล่าสุดปิด" ข้ามคืนได้ — ร้านปิดสี่ทุ่มแล้วลูกค้ามาเพิ่มอีกบิล
 * บิลนั้นอยู่คนละวันไทยกับเช้าวันรุ่งขึ้น เดิมตัดที่ต้นวันจึงตกขอบ ไม่มีใครเห็น เงินอยู่ในเก๊ะ
 * แต่เช้ามาขึ้นแค่ว่า "นับได้เกินยอดยกมา" เฉย ๆ แล้วกลบเงินขาดจริงไปด้วย (เจอ 2026-11-07)
 *
 * บูธ/ออนไลน์ไม่ใช่เงินในเก๊ะร้าน — สูตรของกะก็กรองเหลือ 'store' เหมือนกัน
 * ไม่กรอง `status` ฝั่งขาย เพราะบิลที่ยกเลิกทีหลังก็รับเงินสดเข้าเก๊ะไปแล้วตอนขาย (ดู lib/shiftCash)
 */
export async function findOrphanSales(supabase: Db = createClient()): Promise<OrphanSales | null> {
  const { startISO } = thaiDayRange()

  // บิลก่อนกะล่าสุดที่ปิดไปแล้วถูกนับในกะนั้นเรียบร้อย เริ่มนับจากเวลาที่กะล่าสุดปิด
  const { data: last } = await supabase
    .from('shifts')
    .select('closed_at')
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const since = (last?.closed_at as string | undefined) ?? startISO
  const afterClose = !!last?.closed_at

  const [{ data, error }, { data: refundRows }] = await Promise.all([
    supabase
      .from('transactions')
      .select('created_at, status, total, payment_method, transaction_payments(method, amount)')
      .eq('sales_channel', 'store')
      .gte('created_at', since)
      .order('created_at'),
    // ยกเลิกบิลแล้วคืนเงินสดหลังปิดกะ — เงินออกจากเก๊ะไปแล้วหลังกะที่แล้วนับเสร็จ
    supabase
      .from('transactions')
      .select('total')
      .eq('status', 'cancelled')
      .eq('refund_method', 'cash')
      .eq('sales_channel', 'store')
      .gte('cancelled_at', since),
  ])
  if (error) return null

  const rows = (data ?? []) as unknown as (ShiftBill & { created_at: string })[]
  const refunds = (refundRows ?? []).reduce((s, t) => s + Number(t.total), 0)
  if (rows.length === 0 && refunds <= 0) return null
  const split = splitShiftBills(rows)
  const cash = (split.byMethod.cash ?? 0) + split.cashFromCancelled
  if (cash <= 0 && refunds <= 0) return null
  const firstAt = rows[0]?.created_at ?? since
  return {
    firstAt,
    lastAt: rows[rows.length - 1]?.created_at ?? firstAt,
    bills: split.bills,
    cash,
    refunds,
    net: cash - refunds,
    since,
    afterClose,
    hours: (Date.now() - new Date(firstAt).getTime()) / 3_600_000,
  }
}

/** ข้อความ audit ที่เขียนลง `shifts.notes` ตอนย้อนเวลาเปิดกะ (รูปแบบเดียวกับการแก้ยอดย้อนหลัง) */
export function orphanNote(
  orphan: OrphanSales,
  byName: string,
  opts: { counted?: number; pulledIn?: boolean } = {},
) {
  const stamp = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
  const pulledIn = opts.pulledIn ?? true
  const what =
    `บิลหน้าร้าน ${orphan.bills} ใบ ${fmtWhen(orphan.firstAt)}-${fmtTime(orphan.lastAt)} ` +
    `เงินสด ฿${money(orphan.cash)}` +
    (orphan.refunds > 0 ? ` − คืนเงินสด ฿${money(orphan.refunds)}` : '')
  if (!pulledIn) {
    return (
      `[บิลที่ยังไม่เข้ากะ ${stamp} โดย ${byName || 'พนักงาน'}] ไม่รวมเข้ากะนี้ · ${what} · ` +
      `เงินสด ฿${money(orphan.net)} ก้อนนี้อยู่ในยอดตั้งต้นของกะนี้แทน ไม่ได้อยู่ในยอดขายของกะไหน`
    )
  }
  const math =
    opts.counted != null
      ? ` · ยอดตั้งต้น = ที่นับได้ ฿${money(opts.counted)} − ฿${money(orphan.net)} = ฿${money(opts.counted - orphan.net)}`
      : ''
  return (
    `[รวมบิลที่ยังไม่เข้ากะ ${stamp} โดย ${byName || 'พนักงาน'}] ` +
    `ย้อนเวลาเปิดกะไปที่ ${fmtWhen(orphan.firstAt)} · ${what}${math}`
  )
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
 * ข้อความ audit ตอนเงินที่นับได้เช้านี้ไม่เท่ายอดที่ควรมี — เขียนลง `shifts.notes`
 * ส่วนต่างตรงนี้คือเงินที่หายหรือเกินระหว่างปิดกะเมื่อวานกับเปิดกะวันนี้ ต้องมีหลักฐานไว้
 *
 * `pending` = เงินสดสุทธิจากบิลที่ขายหลังปิดกะ (ดู findOrphanSales) เงินก้อนนั้นอยู่ในเก๊ะด้วย
 * ควรมี = ยกมา + ขายหลังปิดกะ — ไม่บวกเข้าไปจะขึ้นว่า "เกิน" ทุกคืนที่ลูกค้ามาเพิ่มตอนนับเงิน
 */
export function carryNote(
  carry: CarryOver,
  openingCash: number,
  byName: string,
  reason = '',
  counted: Record<number, number> | null = null,
  pending = 0,
) {
  const expected = carry.amount + pending
  const diff = openingCash - expected
  // มีบิลหลังปิดกะ = กองแบงค์ย่อมไม่ตรงกับใบนับเมื่อคืนอยู่แล้ว ไล่กองไม่ได้ว่าใบไหนมาจากบิลไหน
  const diffs = pending !== 0 ? [] : denomDiffs(carry, counted)
  const stamp = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
  return (
    `[เงินตั้งต้นไม่ตรงยอดยกมา ${stamp} โดย ${byName || 'พนักงาน'}] ` +
    `ยกมา ฿${money(carry.amount)} (ปิดกะ ${fmtTime(carry.closedAt)} นับได้ ฿${money(carry.counted)}` +
    `${carry.toOwner > 0 ? ` − แยกให้เจ้าของ ฿${money(carry.toOwner)}` : ''}` +
    `${carry.toOwner < 0 ? ` + เจ้าของเติมเข้า ฿${money(-carry.toOwner)}` : ''}) · ` +
    `${pending !== 0 ? `บิลที่ขายหลังปิดกะ ฿${money(pending)} · ควรมี ฿${money(expected)} · ` : ''}` +
    `เช้านี้นับได้ ฿${money(openingCash)} · ${diff > 0 ? 'เกิน' : 'ขาด'} ฿${money(Math.abs(diff))}` +
    `${diffs.length ? ` · กองที่ไม่ตรง: ${diffs.map((x) => `${x.label} ${x.was}→${x.now}`).join(' · ')}` : ''}` +
    `${reason.trim() ? ` · ${reason.trim()}` : ''}`
  )
}

/**
 * เปิดกะใหม่ — `openingCash` คือยอดที่ "นับได้จริงในเก๊ะ" ตอนเปิด
 * คืน error เป็นข้อความไทยพร้อมโชว์ ไม่โยน throw
 *
 * มีบิลที่ยังไม่เข้ากะ (`orphan`) แล้วรวมเข้ากะนี้ (`pullIn`) จะทำสองอย่างคู่กัน:
 * ย้อน `opened_at` ไปที่บิลแรก เพื่อให้ยอดขายก้อนนั้นมาอยู่ในกะนี้ · และหักเงินสดสุทธิของก้อนนั้น
 * ออกจากยอดตั้งต้น เพราะเงินนั้นอยู่ในเก๊ะที่เพิ่งนับไปแล้ว — ไม่หักออกจะถูกนับสองรอบ
 * (ตั้งต้น + ขายเงินสดในกะ) ตอนปิดกะจะขึ้นว่าเงินขาดเท่ายอดก้อนนี้ทั้งที่ไม่มีอะไรหาย
 * เดิมหน้าเปิดกะบอกให้คนหักเอง ("ถ้านับตอนนี้ได้เท่าไหร่ ให้หัก ฿X ออกก่อน") — คิดในใจพลาดง่าย
 */
export async function openShift(
  opts: {
    /** ยอดที่นับได้จริงในเก๊ะตอนเปิดกะ (ไม่ใช่ยอดหลังหักบิลที่ยังไม่เข้ากะ — ระบบหักเอง) */
    openingCash: number
    openedBy: string
    openedByName?: string
    /** บิลที่ยังไม่อยู่ในกะไหน — ขายหลังปิดกะเมื่อคืน หรือขายก่อนเปิดกะวันนี้ */
    orphan?: OrphanSales | null
    /** รวมบิลพวกนั้นเข้ากะนี้ไหม · ไม่ส่งมา = รวม (ค่าเริ่มต้นเดิม) */
    pullIn?: boolean
    /** ยอดยกมาจากกะที่แล้ว — ส่งมาด้วยเพื่อบันทึกส่วนต่างถ้านับได้ไม่เท่ากัน */
    carry?: CarryOver | null
    /** เหตุผลที่คนเปิดกะกรอกไว้ตอนนับได้ไม่ตรงยอดยกมา */
    carryReason?: string
    /** จำนวนใบ/เหรียญที่นับได้ตอนเปิดกะ — ไม่ส่งมา = เปิดกะแบบใส่ยอดรวมอย่างเดียว */
    openingDenoms?: Record<number, number> | null
  },
  supabase: Db = createClient(),
): Promise<{ error?: string }> {
  const orphan = opts.orphan ?? null
  const pullIn = orphan ? opts.pullIn ?? true : false
  const pending = orphan ? orphan.net : 0
  const row: Record<string, unknown> = {
    opening_cash: pullIn ? opts.openingCash - pending : opts.openingCash,
    opened_by: opts.openedBy,
  }
  if (opts.openingDenoms) row.opening_denominations = opts.openingDenoms
  const notes: string[] = []
  if (orphan && pullIn) {
    row.opened_at = orphan.firstAt
    notes.push(orphanNote(orphan, opts.openedByName ?? '', { counted: opts.openingCash, pulledIn: true }))
  } else if (orphan) {
    notes.push(orphanNote(orphan, opts.openedByName ?? '', { pulledIn: false }))
  }
  // เทียบ "ที่นับได้จริง" กับ "ยกมา + บิลหลังปิดกะ" — ไม่ใช่กับยอดตั้งต้นที่หักแล้ว
  if (opts.carry && opts.carry.amount + pending !== opts.openingCash) {
    notes.push(carryNote(
      opts.carry, opts.openingCash, opts.openedByName ?? '', opts.carryReason,
      opts.openingDenoms ?? null, pending,
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
