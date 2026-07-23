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

// ช่วงเวลาของ "พรุ่งนี้" ตามเวลาไทย แปลงเป็น UTC ไว้ query scheduled_at (timestamptz)
export async function gatherTomorrowAppointments(
  admin: ReturnType<typeof createAdminClient>
): Promise<AppointmentReminder[]> {
  const tomorrow = addDays(todayThai(), 1)
  // ไทย = UTC+7 → 00:00 ของพรุ่งนี้ (ไทย) = 17:00 ของวันนี้ (UTC)
  const startUtc = new Date(`${tomorrow}T00:00:00+07:00`).toISOString()
  const endUtc = new Date(`${addDays(tomorrow, 1)}T00:00:00+07:00`).toISOString()

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

export function buildAppointmentMessage(appointments: AppointmentReminder[]): string | null {
  if (appointments.length === 0) return null

  const headerDate = new Date(`${addDays(todayThai(), 1)}T00:00:00`).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit',
  })

  const lines = appointments.map((a) => {
    const who = [a.ownerName, a.ownerPhone].filter(Boolean).join(' ')
    return `• ${a.time} — ${a.petName} (${APPOINTMENT_TYPE_TH[a.type] ?? a.type})${who ? ` · ${who}` : ''}${a.notes ? `\n   ${a.notes}` : ''}`
  })

  return [`📅 LANDBARK นัดหมายพรุ่งนี้ (${headerDate}) — ${appointments.length} นัด`, ...lines].join('\n')
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

  const [alerts, appointments, vaccineDue] = await Promise.all([
    gatherStockAlerts(admin, settings?.expiry_days ?? 30),
    gatherTomorrowAppointments(admin),
    gatherDueVaccines(admin),
  ])
  const counts = {
    lowStock: alerts.lowStock.length,
    expiring: alerts.expiring.length,
    expired: alerts.expired.length,
  }

  // รวมแจ้งเตือนสต็อค + นัดพรุ่งนี้ + วัคซีนครบกำหนด ไว้ในข้อความเดียว (ส่งถ้ามีอย่างใดอย่างหนึ่ง)
  const parts = [
    buildAlertMessage(alerts),
    buildAppointmentMessage(appointments),
    buildVaccineMessage(vaccineDue),
  ].filter(Boolean) as string[]
  let message: string | null = parts.length > 0 ? parts.join('\n\n———\n\n') : null
  if (!message) {
    if (!sendWhenEmpty) return { sent: false, reason: 'nothing_to_alert', counts }
    message = '🐾 LANDBARK — ทดสอบแจ้งเตือนสำเร็จ ✅\nตอนนี้ไม่มีสินค้าสต็อคต่ำ/ใกล้หมดอายุ และไม่มีนัดหมายพรุ่งนี้'
  }

  const results = await Promise.allSettled(chatIds.map((id) => sendTelegramMessage(id, message!)))
  const failed = results.filter((r) => r.status === 'rejected').length

  return { sent: true, recipients: chatIds.length, failed, counts }
}
