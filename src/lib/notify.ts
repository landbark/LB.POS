import { createAdminClient } from '@/lib/supabase/admin'
import { dueVaccinations } from '@/lib/vaccines'

const MAX_ITEMS_PER_SECTION = 15

interface LowStockItem {
  name: string
  total: number
  minStock: number
  unit: string
}

interface ExpiryItem {
  name: string
  lotNumber: string | null
  quantity: number
  unit: string
  expiryDate: string
}

export interface StockAlerts {
  lowStock: LowStockItem[]
  expiring: ExpiryItem[]
  expired: ExpiryItem[]
  expiryDays: number
}

interface ProductWithLots {
  name: string
  unit: string
  min_stock: number
  product_lots: { lot_number: string | null; quantity: number; expiry_date: string | null }[]
}

const todayThai = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

const dateTh = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export async function gatherStockAlerts(
  admin: ReturnType<typeof createAdminClient>,
  expiryDays: number
): Promise<StockAlerts> {
  const { data } = await admin
    .from('products')
    .select('name, unit, min_stock, product_lots(lot_number, quantity, expiry_date)')
    .eq('active', true)
    // ค่าบริการไม่มีสต็อค — ไม่งั้นจะขึ้นเตือน "สต็อคต่ำ" ทุกวัน
    .eq('is_service', false)

  const products = (data ?? []) as ProductWithLots[]
  const today = todayThai()
  const expiryLimit = addDays(today, expiryDays)

  const lowStock: LowStockItem[] = []
  const expiring: ExpiryItem[] = []
  const expired: ExpiryItem[] = []

  for (const p of products) {
    const lots = p.product_lots ?? []
    const total = lots.reduce((sum, lot) => sum + lot.quantity, 0)

    // เกณฑ์เดียวกับ badge สต็อคต่ำในหน้าสินค้า
    if (total <= p.min_stock) {
      lowStock.push({ name: p.name, total, minStock: p.min_stock, unit: p.unit })
    }

    for (const lot of lots) {
      if (lot.quantity <= 0 || !lot.expiry_date) continue
      const item: ExpiryItem = {
        name: p.name,
        lotNumber: lot.lot_number,
        quantity: lot.quantity,
        unit: p.unit,
        expiryDate: lot.expiry_date,
      }
      if (lot.expiry_date < today) expired.push(item)
      else if (lot.expiry_date <= expiryLimit) expiring.push(item)
    }
  }

  lowStock.sort((a, b) => a.total - b.total)
  expiring.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  expired.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))

  return { lowStock, expiring, expired, expiryDays }
}

// ---- นัดหมายพรุ่งนี้ ----

const APPOINTMENT_TYPE_TH: Record<string, string> = {
  checkup: 'ตรวจรักษา',
  vaccine: 'ฉีดวัคซีน',
  surgery: 'ผ่าตัด',
  follow_up: 'ติดตามอาการ',
  other: 'อื่นๆ',
}

interface AppointmentReminder {
  time: string
  petName: string
  ownerName: string | null
  ownerPhone: string | null
  type: string
  notes: string | null
}

// นัดหมายของวันที่ระบุ (YYYY-MM-DD เวลาไทย) — แปลงเป็น UTC ไว้ query scheduled_at (timestamptz)
export async function gatherAppointmentsOn(
  admin: ReturnType<typeof createAdminClient>,
  date: string
): Promise<AppointmentReminder[]> {
  // ไทย = UTC+7 → 00:00 ของวันนั้น (ไทย) = 17:00 ของวันก่อนหน้า (UTC)
  const startUtc = new Date(`${date}T00:00:00+07:00`).toISOString()
  const endUtc = new Date(`${addDays(date, 1)}T00:00:00+07:00`).toISOString()

  const { data } = await admin
    .from('appointments')
    .select('scheduled_at, type, notes, pets(name), customers(name, phone)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', startUtc)
    .lt('scheduled_at', endUtc)
    .order('scheduled_at')

  return (data ?? []).map((a) => {
    const pet = a.pets as unknown as { name: string } | null
    const owner = a.customers as unknown as { name: string; phone: string } | null
    return {
      time: new Date(a.scheduled_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }),
      petName: pet?.name ?? '—',
      ownerName: owner?.name ?? null,
      ownerPhone: owner?.phone ?? null,
      type: a.type,
      notes: a.notes,
    }
  })
}

export function buildAppointmentMessage(
  appointments: AppointmentReminder[],
  { date, heading }: { date: string; heading: string }
): string | null {
  if (appointments.length === 0) return null

  const headerDate = new Date(`${date}T00:00:00`).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit',
  })

  const lines = appointments.map((a) => {
    const who = [a.ownerName, a.ownerPhone].filter(Boolean).join(' ')
    return `• ${a.time} — ${a.petName} (${APPOINTMENT_TYPE_TH[a.type] ?? a.type})${who ? ` · ${who}` : ''}${a.notes ? `\n   ${a.notes}` : ''}`
  })

  return [`${heading} (${headerDate}) — ${appointments.length} นัด`, ...lines].join('\n')
}

// ---- วัคซีนครบกำหนด ----

interface VaccineDueRow {
  pet_id: string
  vaccine_name: string
  dose_date: string
  next_due_date: string | null
  pets: { name: string; active: boolean; customers: { name: string; phone: string } | null } | null
}

// วัคซีนที่ครบกำหนดกระตุ้นภายใน 7 วัน + ที่เลยกำหนดแล้ว
export async function gatherDueVaccines(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from('pet_vaccinations')
    .select('pet_id, vaccine_name, dose_date, next_due_date, pets!inner(name, active, customers(name, phone))')
    .eq('pets.active', true)
    .limit(5000)

  const rows = (data ?? []) as unknown as VaccineDueRow[]
  return dueVaccinations(rows, todayThai(), 7)
}

export function buildVaccineMessage(due: Awaited<ReturnType<typeof gatherDueVaccines>>): string | null {
  if (due.length === 0) return null

  const lines = due.map((d) => {
    const owner = [d.row.pets?.customers?.name, d.row.pets?.customers?.phone].filter(Boolean).join(' ')
    const tag = d.overdue ? '⚠️เกินกำหนด' : '⏰'
    return `• ${tag} ${d.row.pets?.name ?? '—'} — ${d.row.vaccine_name}${d.row.next_due_date ? ` (${dateTh(d.row.next_due_date)})` : ''}${owner ? `\n   ${owner}` : ''}`
  })

  return [`💉 LANDBARK วัคซีนครบกำหนด — ${due.length} รายการ`, ...lines].join('\n')
}

function section(title: string, lines: string[]): string {
  const shown = lines.slice(0, MAX_ITEMS_PER_SECTION)
  const more = lines.length - shown.length
  return [
    `${title} (${lines.length} รายการ)`,
    ...shown,
    ...(more > 0 ? [`  …และอีก ${more} รายการ`] : []),
  ].join('\n')
}

export function buildAlertMessage(alerts: StockAlerts): string | null {
  const { lowStock, expiring, expired, expiryDays } = alerts
  if (lowStock.length === 0 && expiring.length === 0 && expired.length === 0) return null

  const headerDate = new Date().toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const sections: string[] = [`🐾 LANDBARK แจ้งเตือนสต็อค (${headerDate})`]

  if (expired.length > 0) {
    sections.push(section('❌ หมดอายุแล้ว', expired.map(
      (i) => `• ${i.name}${i.lotNumber ? ` [${i.lotNumber}]` : ''} — ${i.quantity} ${i.unit} หมดอายุ ${dateTh(i.expiryDate)}`
    )))
  }
  if (expiring.length > 0) {
    sections.push(section(`⏰ ใกล้หมดอายุใน ${expiryDays} วัน`, expiring.map(
      (i) => `• ${i.name}${i.lotNumber ? ` [${i.lotNumber}]` : ''} — ${i.quantity} ${i.unit} หมดอายุ ${dateTh(i.expiryDate)}`
    )))
  }
  if (lowStock.length > 0) {
    sections.push(section('🔴 สต็อคต่ำ', lowStock.map(
      (i) => `• ${i.name} — เหลือ ${i.total} ${i.unit} (ขั้นต่ำ ${i.minStock})`
    )))
  }

  return sections.join('\n\n')
}

// ---- Telegram delivery ----

const telegramApi = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`

export async function sendTelegramMessage(chatId: string, text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN')

  const res = await fetch(telegramApi('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram (${chatId}): ${data.description ?? res.status}`)
}

export interface SendResult {
  sent: boolean
  reason?: 'disabled' | 'no_recipients' | 'nothing_to_alert'
  recipients?: number
  failed?: number
  counts?: { lowStock: number; expiring: number; expired: number }
}

// ใช้ร่วมกันทั้ง cron และปุ่มทดสอบ — sendWhenEmpty: ส่งข้อความยืนยันแม้ไม่มีรายการ (โหมดทดสอบ)
export async function sendStockAlerts(
  { ignoreDisabled = false, sendWhenEmpty = false } = {}
): Promise<SendResult> {
  const admin = createAdminClient()

  const [{ data: settings }, { data: recipients }] = await Promise.all([
    admin.from('notify_settings').select('enabled, expiry_days').eq('id', 1).maybeSingle(),
    admin.from('telegram_recipients').select('chat_id').eq('approved', true),
  ])

  if (!ignoreDisabled && settings?.enabled === false) {
    return { sent: false, reason: 'disabled' }
  }

  const chatIds = (recipients ?? []).map((r) => r.chat_id)
  if (chatIds.length === 0) return { sent: false, reason: 'no_recipients' }

  const today = todayThai()
  const tomorrow = addDays(today, 1)
  const [alerts, todayAppointments, tomorrowAppointments, vaccineDue] = await Promise.all([
    gatherStockAlerts(admin, settings?.expiry_days ?? 30),
    gatherAppointmentsOn(admin, today),
    gatherAppointmentsOn(admin, tomorrow),
    gatherDueVaccines(admin),
  ])
  const counts = {
    lowStock: alerts.lowStock.length,
    expiring: alerts.expiring.length,
    expired: alerts.expired.length,
  }

  // รวมแจ้งเตือนสต็อค + นัดพรุ่งนี้ + วัคซีนครบกำหนด ไว้ในข้อความเดียว (ส่งถ้ามีอย่างใดอย่างหนึ่ง)
  const parts = [
    // นัดวันนี้ขึ้นก่อน — เป็นสิ่งที่ต้องลงมือทำภายในวัน
    buildAppointmentMessage(todayAppointments, { date: today, heading: '📅 LANDBARK นัดหมายวันนี้' }),
    buildAlertMessage(alerts),
    buildAppointmentMessage(tomorrowAppointments, { date: tomorrow, heading: '🗓️ นัดหมายพรุ่งนี้' }),
    buildVaccineMessage(vaccineDue),
  ].filter(Boolean) as string[]
  let message: string | null = parts.length > 0 ? parts.join('\n\n———\n\n') : null
  if (!message) {
    if (!sendWhenEmpty) return { sent: false, reason: 'nothing_to_alert', counts }
    message = '🐾 LANDBARK — ทดสอบแจ้งเตือนสำเร็จ ✅\nตอนนี้ไม่มีสินค้าสต็อคต่ำ/ใกล้หมดอายุ และไม่มีนัดหมายวันนี้/พรุ่งนี้'
  }

  const results = await Promise.allSettled(chatIds.map((id) => sendTelegramMessage(id, message!)))
  const failed = results.filter((r) => r.status === 'rejected').length

  return { sent: true, recipients: chatIds.length, failed, counts }
}

// ---- แจ้งเตือนทันเหตุการณ์ (ออเดอร์ใหม่ / สลิป / ปิดกะ / สรุปยอดวัน) ----

export type NotifyEvent =
  | 'new_order' | 'payment_slip' | 'new_appointment' | 'shift_close' | 'daily_sales'

const EVENT_COLUMN: Record<NotifyEvent, string> = {
  new_order: 'notify_new_order',
  payment_slip: 'notify_payment_slip',
  new_appointment: 'notify_new_appointment',
  shift_close: 'notify_shift_close',
  daily_sales: 'notify_daily_sales',
}

// เรื่องเงิน — ส่งเฉพาะผู้รับที่ติ๊กว่าเป็นเจ้าของ พนักงานไม่ต้องเห็นยอดขาย/เงินขาดเกิน
const OWNER_ONLY: ReadonlySet<NotifyEvent> = new Set<NotifyEvent>(['shift_close', 'daily_sales'])

/** ลิงก์กลับเข้าหลังร้าน — ตั้ง NEXT_PUBLIC_SITE_URL บน Vercel ไว้ให้ลิงก์ในข้อความกดได้ */
export function adminLink(path: string): string {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
  return origin ? `\n${origin}${path}` : ''
}

/**
 * ส่งแจ้งเตือนเหตุการณ์ให้ผู้รับที่อนุมัติแล้ว
 * ไม่ throw ออกไปเด็ดขาด — แจ้งเตือนล้มเหลวต้องไม่ทำให้ลูกค้าสั่งของไม่ได้
 * dedupeKey: กันส่งซ้ำตอน Vercel retry (ใช้ PK ของ notify_log กันชนกัน)
 */
export async function notifyEvent(
  event: NotifyEvent,
  text: string,
  { dedupeKey }: { dedupeKey?: string } = {}
): Promise<void> {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) return
    const admin = createAdminClient()

    // select('*') กันพังช่วงก่อนรัน migration (คอลัมน์ notify_* อาจยังไม่มี)
    const { data } = await admin.from('notify_settings').select('*').eq('id', 1).maybeSingle()
    const settings = data as Record<string, unknown> | null

    if (settings?.enabled === false) return
    // ยังไม่ได้รัน migration → คอลัมน์ไม่มี = undefined, ถือว่าเปิด
    if (settings?.[EVENT_COLUMN[event]] === false) return

    if (dedupeKey) {
      const { error } = await admin.from('notify_log').insert({ event_key: dedupeKey })
      if (error) return // ชน PK = เคยส่งไปแล้ว
    }

    // select('*') กันพังช่วงก่อนรัน migration (คอลัมน์ is_owner อาจยังไม่มี)
    const { data: recipients } = await admin
      .from('telegram_recipients')
      .select('*')
      .eq('approved', true)

    // ไม่มี fallback ตั้งใจ: ถ้ายังไม่มีใครเป็นเจ้าของ ข้อความเรื่องเงินจะไม่ถูกส่ง
    // ดีกว่าเผลอส่งยอดขายให้พนักงาน — หน้าแจ้งเตือนจะขึ้นเตือนให้ไปติ๊กเอง
    const list = (recipients ?? []).filter((r) => !OWNER_ONLY.has(event) || r.is_owner === true)

    const chatIds = list.map((r) => r.chat_id)
    if (chatIds.length === 0) return

    await Promise.allSettled(chatIds.map((id) => sendTelegramMessage(id, text)))
  } catch {
    // แจ้งเตือนเป็นงานเสริม — เงียบไว้ ไม่ให้ล้มงานหลัก
  }
}

const baht = (n: number) => `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const timeThai = () =>
  new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })

export interface NewOrderInfo {
  orderNumber: string
  orderId: string
  customerName: string | null
  total: number
  itemCount: number
  fulfillment: 'delivery' | 'pickup'
  province?: string | null
  note?: string | null
}

export function buildNewOrderMessage(o: NewOrderInfo): string {
  const where = o.fulfillment === 'pickup' ? '🏠 รับที่ร้าน' : `🚚 จัดส่ง${o.province ? ` · ${o.province}` : ''}`
  return [
    `🛒 ออเดอร์ออนไลน์ใหม่ — ${o.orderNumber}`,
    `${o.customerName ?? 'ลูกค้า'} · ${o.itemCount} รายการ · ${baht(o.total)}`,
    where,
    ...(o.note ? [`📝 ${o.note}`] : []),
    `⏰ ${timeThai()} น. — รอลูกค้าชำระเงิน`,
  ].join('\n') + adminLink(`/admin/orders/${o.orderId}`)
}

export function buildPaymentSlipMessage(o: {
  orderNumber: string
  orderId: string
  customerName: string | null
  total: number
}): string {
  return [
    `💸 ลูกค้าแจ้งโอนแล้ว — ${o.orderNumber}`,
    `${o.customerName ?? 'ลูกค้า'} · ${baht(o.total)}`,
    `⏰ ${timeThai()} น. — รอตรวจสลิปและยืนยันออเดอร์`,
  ].join('\n') + adminLink(`/admin/orders/${o.orderId}`)
}

export interface NewAppointmentInfo {
  petName: string
  ownerName: string | null
  ownerPhone: string | null
  type: string
  scheduledAt: string
  notes: string | null
  createdBy: string | null
}

export function buildNewAppointmentMessage(a: NewAppointmentInfo): string {
  const when = new Date(a.scheduledAt).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short', day: 'numeric', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const who = [a.ownerName, a.ownerPhone].filter(Boolean).join(' ')

  return [
    '🗓️ นัดใหม่ถูกบันทึก',
    `${a.petName} (${APPOINTMENT_TYPE_TH[a.type] ?? a.type})`,
    `📅 ${when} น.`,
    ...(who ? [who] : []),
    ...(a.notes ? [`📝 ${a.notes}`] : []),
    ...(a.createdBy ? [`บันทึกโดย: ${a.createdBy}`] : []),
  ].join('\n') + adminLink('/admin/appointments')
}

export interface ShiftCloseInfo {
  closedBy: string | null
  expectedCash: number
  countedCash: number
  difference: number
  cashToOwner: number
  salesTotal: number
  txCount: number
  notes: string | null
}

export function buildShiftCloseMessage(s: ShiftCloseInfo): string {
  const diffLine =
    s.difference === 0
      ? '✅ เงินตรงพอดี'
      : s.difference > 0
        ? `🔵 เงินเกิน ${baht(s.difference)}`
        : `🔴 เงินขาด ${baht(Math.abs(s.difference))}`

  return [
    `🧾 ปิดกะแล้ว — ${timeThai()} น.`,
    `ผู้ปิดกะ: ${s.closedBy ?? '—'}`,
    '',
    `ยอดขายในกะ: ${baht(s.salesTotal)} (${s.txCount} บิล)`,
    `เงินสดที่ควรมี: ${baht(s.expectedCash)}`,
    `นับได้จริง: ${baht(s.countedCash)}`,
    diffLine,
    ...(s.cashToOwner > 0 ? [`👜 แยกให้เจ้าของ: ${baht(s.cashToOwner)}`] : []),
    ...(s.notes ? ['', `📝 ${s.notes}`] : []),
  ].join('\n') + adminLink('/admin/daily')
}

/** สรุปยอดขายของวัน (เวลาไทย) สำหรับ cron รอบเย็น */
export async function gatherDailySales(admin: ReturnType<typeof createAdminClient>, date: string) {
  const startISO = new Date(`${date}T00:00:00+07:00`).toISOString()
  const endISO = new Date(`${addDays(date, 1)}T00:00:00+07:00`).toISOString()

  const [{ data: completed }, { data: cancelled }, { data: items }] = await Promise.all([
    admin
      .from('transactions')
      .select('total, payment_method')
      .eq('status', 'completed')
      .gte('created_at', startISO)
      .lt('created_at', endISO),
    admin
      .from('transactions')
      .select('total')
      .eq('status', 'cancelled')
      .gte('cancelled_at', startISO)
      .lt('cancelled_at', endISO),
    admin
      .from('transaction_items')
      .select('quantity, subtotal, products(name), transactions!inner(status, created_at)')
      .eq('transactions.status', 'completed')
      .gte('transactions.created_at', startISO)
      .lt('transactions.created_at', endISO),
  ])

  const tx = completed ?? []
  const total = tx.reduce((s, t) => s + t.total, 0)

  const byMethodMap: Record<string, number> = {}
  for (const t of tx) byMethodMap[t.payment_method] = (byMethodMap[t.payment_method] ?? 0) + t.total

  const sellerMap: Record<string, { qty: number; revenue: number }> = {}
  for (const it of (items ?? []) as unknown as {
    quantity: number
    subtotal: number
    products: { name: string } | null
  }[]) {
    const name = it.products?.name
    if (!name) continue
    const s = (sellerMap[name] ??= { qty: 0, revenue: 0 })
    s.qty += it.quantity
    s.revenue += it.subtotal
  }

  const bestSellers = Object.entries(sellerMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  return {
    date,
    total,
    txCount: tx.length,
    byMethod: Object.entries(byMethodMap).map(([method, amount]) => ({ method, amount })),
    cancelledCount: cancelled?.length ?? 0,
    cancelledTotal: cancelled?.reduce((s, t) => s + t.total, 0) ?? 0,
    bestSellers,
  }
}

const PAYMENT_TH: Record<string, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  card: 'บัตรเครดิต',
  qr: 'QR Code',
}

export function buildDailySalesMessage(s: Awaited<ReturnType<typeof gatherDailySales>>): string | null {
  if (s.txCount === 0 && s.cancelledCount === 0) return null

  const label = new Date(`${s.date}T00:00:00+07:00`).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short',
  })

  const lines = [
    `📊 สรุปยอดขายวันนี้ (${label})`,
    '',
    `💰 ยอดขายรวม ${baht(s.total)} · ${s.txCount} บิล`,
  ]

  if (s.byMethod.length > 0) {
    lines.push(...s.byMethod
      .sort((a, b) => b.amount - a.amount)
      .map((m) => `   • ${PAYMENT_TH[m.method] ?? m.method} ${baht(m.amount)}`))
  }

  if (s.cancelledCount > 0) {
    lines.push('', `❌ ยกเลิก ${s.cancelledCount} บิล (${baht(s.cancelledTotal)})`)
  }

  if (s.bestSellers.length > 0) {
    lines.push('', '🏆 ขายดีวันนี้')
    lines.push(...s.bestSellers.map((b, i) => `   ${i + 1}. ${b.name} — ${b.qty} ชิ้น ${baht(b.revenue)}`))
  }

  return lines.join('\n') + adminLink('/admin/daily')
}
