import { createAdminClient } from '@/lib/supabase/admin'

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

  const alerts = await gatherStockAlerts(admin, settings?.expiry_days ?? 30)
  const counts = {
    lowStock: alerts.lowStock.length,
    expiring: alerts.expiring.length,
    expired: alerts.expired.length,
  }

  let message = buildAlertMessage(alerts)
  if (!message) {
    if (!sendWhenEmpty) return { sent: false, reason: 'nothing_to_alert', counts }
    message = '🐾 LANDBARK — ทดสอบแจ้งเตือนสำเร็จ ✅\nตอนนี้ไม่มีสินค้าสต็อคต่ำหรือใกล้หมดอายุ'
  }

  const results = await Promise.allSettled(chatIds.map((id) => sendTelegramMessage(id, message!)))
  const failed = results.filter((r) => r.status === 'rejected').length

  return { sent: true, recipients: chatIds.length, failed, counts }
}
