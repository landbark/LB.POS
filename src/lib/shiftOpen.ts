// เปิดกะ — ใช้ร่วมกันระหว่างหน้า "ปิดกะ/เงินสด" กับแถบเตือน "ยังไม่ได้เปิดกะ" ในหน้าขาย
//
// สูตร "เงินที่ควรมีในเก๊ะ" นับบิลตามเวลา (`created_at >= shifts.opened_at`) บิลที่ขายตอนไม่มีกะ
// เปิดจึงตกนอกกะทุกกะ เงินอยู่ในเก๊ะแต่ไม่มีใครนับ ตอนปิดกะจะขึ้นว่า "เงินเกิน" เท่ายอดนั้นแล้ว
// กลบเงินขาดจริง/เงินที่หยิบไปใช้โดยไม่ได้ลงบันทึกไปด้วย — เปิดกะทีหลังจึงเสนอย้อนเวลาเปิดกะ
// ไปที่บิลแรกของช่วงที่ไม่มีกะ ให้บิลพวกนั้นกลับเข้ามาอยู่ในกะ

import { createClient } from '@/lib/supabase/client'
import { sumByMethod, type PaidTransaction } from '@/lib/payments'
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
  },
  supabase: Db = createClient(),
): Promise<{ error?: string }> {
  const row: Record<string, unknown> = {
    opening_cash: opts.openingCash,
    opened_by: opts.openedBy,
  }
  if (opts.orphan) {
    row.opened_at = opts.orphan.firstAt
    row.notes = orphanNote(opts.orphan, opts.openedByName ?? '')
  }
  const { error } = await supabase.from('shifts').insert(row)
  if (error) return { error: error.code === '23505' ? 'มีกะที่เปิดอยู่แล้ว' : 'เปิดกะไม่สำเร็จ: ' + error.message }
  return {}
}
