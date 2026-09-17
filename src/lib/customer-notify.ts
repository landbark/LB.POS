import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/notify'
import { DEFAULT_REMINDER_FOOTER } from '@/lib/types'

const TOKEN_TTL_MINUTES = 30

const todayThai = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/** ชื่อบอทสำหรับประกอบ deep link — ไม่ตั้ง = ยังเชื่อมไม่ได้ */
export function botUsername(): string | null {
  const name = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, '')
  return name || null
}

/**
 * สร้างโทเคนใช้ครั้งเดียวสำหรับ t.me/<bot>?start=<token>
 * Telegram จำกัด start param ที่ 64 ตัว [A-Za-z0-9_-] — hex 32 ตัวจึงปลอดภัย
 */
export async function createLinkToken(customerId: string): Promise<string> {
  const admin = createAdminClient()
  const token = randomBytes(16).toString('hex')

  // โทเคนเก่าของลูกค้าคนนี้ไม่ต้องเก็บ (กดปุ่มใหม่ = ของเก่าใช้ไม่ได้)
  await admin.from('customer_telegram_tokens').delete().eq('customer_id', customerId)
  await admin.from('customer_telegram_tokens').insert({
    token,
    customer_id: customerId,
    expires_at: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString(),
  })

  return token
}

/** ใช้โทเคนผูก chat กับลูกค้า — คืนชื่อลูกค้าถ้าสำเร็จ */
export async function redeemLinkToken(token: string, chatId: string): Promise<string | null> {
  const admin = createAdminClient()

  const { data: row } = await admin
    .from('customer_telegram_tokens')
    .select('customer_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!row) return null
  // ใช้แล้วทิ้งเสมอ ไม่ว่าจะหมดอายุหรือไม่
  await admin.from('customer_telegram_tokens').delete().eq('token', token)
  if (new Date(row.expires_at) < new Date()) return null

  // chat เดียวผูกได้กับลูกค้าคนเดียว — ย้ายมาคนใหม่ถ้าเคยผูกไว้กับคนเก่า
  await admin
    .from('customers')
    .update({ telegram_chat_id: null, telegram_linked_at: null })
    .eq('telegram_chat_id', chatId)
    .neq('id', row.customer_id)

  const { data: customer } = await admin
    .from('customers')
    .update({
      telegram_chat_id: chatId,
      telegram_linked_at: new Date().toISOString(),
      telegram_notify: true,
    })
    .eq('id', row.customer_id)
    .select('name')
    .maybeSingle()

  return customer?.name ?? null
}

/** ลูกค้าพิมพ์ /stop — เลิกรับแจ้งเตือน คืน true ถ้าเคยผูกไว้จริง */
export async function unlinkCustomerChat(chatId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('customers')
    .update({ telegram_chat_id: null, telegram_linked_at: null })
    .eq('telegram_chat_id', chatId)
    .select('id')

  return (data ?? []).length > 0
}

// ---- เตือนนัดหมายให้เจ้าของสัตว์ ----

const APPOINTMENT_TYPE_TH: Record<string, string> = {
  checkup: 'ตรวจรักษา',
  vaccine: 'ฉีดวัคซีน',
  surgery: 'ผ่าตัด',
  follow_up: 'ติดตามอาการ',
  other: 'นัดหมาย',
}

interface CustomerAppointmentRow {
  id: string
  scheduled_at: string
  type: string
  notes: string | null
  pets: { name: string } | null
  customers: { id: string; name: string; telegram_chat_id: string | null; telegram_notify: boolean } | null
}

export type ReminderKind = 'tomorrow' | 'today'

/** นัดของวันที่ระบุ เฉพาะลูกค้าที่ผูก Telegram และยังเปิดรับแจ้งเตือน */
export async function gatherCustomerAppointments(
  admin: ReturnType<typeof createAdminClient>,
  date: string
): Promise<CustomerAppointmentRow[]> {
  const startUtc = new Date(`${date}T00:00:00+07:00`).toISOString()
  const endUtc = new Date(`${addDays(date, 1)}T00:00:00+07:00`).toISOString()

  const { data } = await admin
    .from('appointments')
    .select('id, scheduled_at, type, notes, pets(name), customers!inner(id, name, telegram_chat_id, telegram_notify)')
    .eq('status', 'scheduled')
    .not('customers.telegram_chat_id', 'is', null)
    .eq('customers.telegram_notify', true)
    .gte('scheduled_at', startUtc)
    .lt('scheduled_at', endUtc)
    .order('scheduled_at')

  return (data ?? []) as unknown as CustomerAppointmentRow[]
}

export function buildCustomerReminder(
  row: CustomerAppointmentRow,
  kind: ReminderKind,
  footer: string = DEFAULT_REMINDER_FOOTER
): string {
  const time = new Date(row.scheduled_at).toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit',
  })
  const dateLabel = new Date(row.scheduled_at).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'long',
  })

  const petName = row.pets?.name ?? 'น้อง'
  const typeTh = APPOINTMENT_TYPE_TH[row.type] ?? 'นัดหมาย'

  const header = kind === 'today'
    ? `⏰ วันนี้มีนัด ${typeTh} ของ ${petName} ค่ะ`
    : `📅 พรุ่งนี้มีนัด ${typeTh} ของ ${petName} นะคะ`

  const contact = footer.trim()

  return [
    header,
    '',
    `🗓️ ${dateLabel} เวลา ${time} น.`,
    ...(row.notes ? [`📝 ${row.notes}`] : []),
    ...(contact ? ['', contact] : []),
  ].join('\n')
}

export interface CustomerReminderResult {
  sent: number
  failed: number
  skipped: number
}

/**
 * ส่งเตือนนัดให้เจ้าของสัตว์ — เตือนล่วงหน้า 1 วัน และซ้ำอีกครั้งเช้าวันนัด
 * กันส่งซ้ำด้วย appointment_reminder_log (PK ชนกัน = เคยส่งแล้ว)
 */
export async function sendCustomerAppointmentReminders(): Promise<CustomerReminderResult> {
  const result: CustomerReminderResult = { sent: 0, failed: 0, skipped: 0 }
  if (!process.env.TELEGRAM_BOT_TOKEN) return result

  const admin = createAdminClient()

  const { data: settings } = await admin.from('notify_settings').select('*').eq('id', 1).maybeSingle()
  const s = settings as Record<string, unknown> | null
  if (s?.enabled === false || s?.notify_customer_appointment === false) return result

  const footer = typeof s?.customer_reminder_footer === 'string'
    ? s.customer_reminder_footer
    : DEFAULT_REMINDER_FOOTER

  const today = todayThai()
  const jobs: { date: string; kind: ReminderKind }[] = [
    { date: today, kind: 'today' },
    { date: addDays(today, 1), kind: 'tomorrow' },
  ]

  for (const job of jobs) {
    const rows = await gatherCustomerAppointments(admin, job.date)

    for (const row of rows) {
      const chatId = row.customers?.telegram_chat_id
      if (!chatId) continue

      // จองคีย์ก่อนส่ง — ถ้าชน PK แปลว่ารอบก่อนส่งไปแล้ว
      const { error } = await admin
        .from('appointment_reminder_log')
        .insert({ reminder_key: `${row.id}:${job.kind}:${job.date}` })
      if (error) {
        result.skipped += 1
        continue
      }

      try {
        await sendTelegramMessage(chatId, buildCustomerReminder(row, job.kind, footer))
        result.sent += 1
      } catch {
        result.failed += 1
      }
    }
  }

  return result
}
