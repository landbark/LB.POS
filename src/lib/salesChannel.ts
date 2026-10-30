import type { SalesChannel } from '@/lib/types'

export const SALES_CHANNELS: { value: SalesChannel; label: string; short: string }[] = [
  { value: 'store', label: 'หน้าร้าน', short: 'หน้าร้าน' },
  { value: 'booth', label: 'งานออกบูธ', short: 'ออกบูธ' },
  { value: 'online', label: 'เว็บร้าน', short: 'เว็บร้าน' },
  { value: 'shopee', label: 'Shopee', short: 'Shopee' },
  { value: 'tiktok', label: 'TikTok', short: 'TikTok' },
  { value: 'lazada', label: 'Lazada', short: 'Lazada' },
]

export const CHANNEL_LABEL: Record<SalesChannel, string> =
  Object.fromEntries(SALES_CHANNELS.map((c) => [c.value, c.label])) as Record<SalesChannel, string>

// สีประจำช่องทาง (ใกล้เคียงสีแบรนด์ของแต่ละแพลตฟอร์ม) — ใช้กับ badge ในตารางและสรุปรายวัน
export const CHANNEL_BADGE: Record<SalesChannel, string> = {
  store: 'bg-gray-100 text-gray-600',
  booth: 'bg-amber-100 text-amber-800',
  online: 'bg-emerald-100 text-emerald-700',
  shopee: 'bg-orange-100 text-orange-700',
  tiktok: 'bg-neutral-900 text-white',
  lazada: 'bg-indigo-100 text-indigo-700',
}

/**
 * ขายผ่านแพลตฟอร์ม = เงินเข้าผ่านระบบของเขา ไม่ได้รับเงินเอง
 *
 * บูธกับเว็บร้านไม่นับ — บูธรับเงินสด/โอน/สแกนจ่ายเองที่หน้างานเหมือนหน้าร้าน
 * ส่วนเว็บร้านลูกค้าโอนเข้าบัญชีร้านตรงๆ แล้วเราตรวจสลิปเอง
 */
export const isPlatformChannel = (c: SalesChannel | null | undefined) =>
  c === 'shopee' || c === 'tiktok' || c === 'lazada'

/** แพลตฟอร์มทั้งหมด — ใช้กรองใน query (PostgREST .in(...)) */
export const PLATFORM_CHANNELS: SalesChannel[] = SALES_CHANNELS
  .map((c) => c.value)
  .filter((c) => isPlatformChannel(c))

/** ช่องทางที่ร้านรับเงินเอง — ใช้กรองใน query (PostgREST .in(...)) ให้ตรงกับ isOwnMoney */
export const OWN_MONEY_CHANNELS: SalesChannel[] = SALES_CHANNELS
  .map((c) => c.value)
  .filter((c) => !isPlatformChannel(c))

/**
 * บิลนี้นับเป็น "เงินที่ร้านรับเอง" ไหม
 *
 * ขายผ่านแพลตฟอร์มไม่ได้เงินเท่าราคาที่ลงบิล — โดนหักค่าธรรมเนียม/ค่าส่ง/ส่วนลดแพลตฟอร์ม
 * แล้วโอนเข้าบัญชีทีหลังเป็นรอบ ตัวเลขจริงดูจากสรุปการเงินของแพลตฟอร์มเท่านั้น
 * POS บันทึกไว้แค่ตัดสต็อก ยอดจึงไม่เข้าสรุปรายวัน/ปิดกะ/วิธีชำระ
 */
export const isOwnMoney = (c: SalesChannel | null | undefined) => !isPlatformChannel(c ?? 'store')

/**
 * ป้าย "รับเงินทางไหน" ของบิลขายผ่านแพลตฟอร์ม — คืน null ถ้าเป็นบิลที่ร้านรับเงินเอง
 *
 * บิลพวกนี้ถูกบันทึกเป็น payment_method 'transfer' ไว้ (คอลัมน์เดิมไม่มีค่าอื่นให้ใส่)
 * แต่เงินไม่ได้โอนเข้าบัญชีร้านตรงๆ โชว์ว่า "โอนเงิน" คนอ่านจะเข้าใจผิด
 */
export const platformPaymentLabel = (c: SalesChannel | null | undefined) =>
  c && isPlatformChannel(c) ? `รับผ่าน ${CHANNEL_LABEL[c]}` : null

// ───────────────────────────────────────────────────────────────
// กลุ่มช่องทางสำหรับหน้าสรุป — หน้าร้าน / ออกบูธ / ออนไลน์
//
// เจ้าของร้านดูเป็นสามก้อนนี้ ไม่ได้ดูทีละแพลตฟอร์ม (เว็บร้าน+Shopee+TikTok+Lazada
// รวมเป็น "ออนไลน์" ก้อนเดียว แล้วค่อยกางดูรายช่องทางข้างใน)
// ───────────────────────────────────────────────────────────────

export type ChannelGroup = 'store' | 'booth' | 'online'

export const CHANNEL_GROUPS: { value: ChannelGroup; label: string; channels: SalesChannel[] }[] = [
  { value: 'store', label: 'หน้าร้าน', channels: ['store'] },
  { value: 'booth', label: 'ออกบูธ', channels: ['booth'] },
  { value: 'online', label: 'ออนไลน์', channels: ['online', 'shopee', 'tiktok', 'lazada'] },
]

export const CHANNEL_GROUP_LABEL: Record<ChannelGroup, string> =
  Object.fromEntries(CHANNEL_GROUPS.map((g) => [g.value, g.label])) as Record<ChannelGroup, string>

export const CHANNEL_GROUP_CHANNELS: Record<ChannelGroup, SalesChannel[]> =
  Object.fromEntries(CHANNEL_GROUPS.map((g) => [g.value, g.channels])) as Record<ChannelGroup, SalesChannel[]>

/** สีของกลุ่ม — ใช้เป็นเส้น/ตัวเลขในการ์ดสรุป ไม่ใช่ badge รายช่องทาง */
export const CHANNEL_GROUP_COLOR: Record<ChannelGroup, { text: string; bg: string }> = {
  store: { text: 'text-gray-700', bg: 'bg-gray-100 text-gray-600' },
  booth: { text: 'text-amber-700', bg: 'bg-amber-100 text-amber-800' },
  online: { text: 'text-emerald-700', bg: 'bg-emerald-100 text-emerald-700' },
}

/** บิลเก่าที่ยังไม่มีคอลัมน์ (หรือค่า null) ถือเป็นหน้าร้านเหมือน default ของ DB */
export const channelGroup = (c: SalesChannel | null | undefined): ChannelGroup =>
  c === 'booth' ? 'booth' : c && c !== 'store' ? 'online' : 'store'

export interface ChannelGroupTotal {
  group: ChannelGroup
  label: string
  /** ยอดตามราคาที่ลงบิลทั้งกลุ่ม (รวมแพลตฟอร์ม) */
  amount: number
  count: number
  /** ส่วนที่เป็นเงินที่ร้านรับเอง — กลุ่มออนไลน์จะน้อยกว่า amount ถ้ามีบิลแพลตฟอร์ม */
  ownAmount: number
  ownCount: number
  byChannel: { channel: SalesChannel; amount: number; count: number }[]
}

/**
 * รวมยอดบิลเป็นสามกลุ่ม พร้อมรายช่องทางข้างใน — คืนครบทุกกลุ่มเสมอ (กลุ่มที่ไม่มีบิลได้ 0)
 * หน้าสรุปจะได้เรียงการ์ดเหมือนกันทุกวัน ไม่ใช่วันไหนไม่มีออกบูธแล้วการ์ดหาย
 */
export function totalsByChannelGroup(
  rows: { total: number; sales_channel?: SalesChannel | null }[]
): ChannelGroupTotal[] {
  const groups = CHANNEL_GROUPS.map<ChannelGroupTotal>((g) => ({
    group: g.value,
    label: g.label,
    amount: 0,
    count: 0,
    ownAmount: 0,
    ownCount: 0,
    byChannel: [],
  }))

  for (const row of rows) {
    const channel = (row.sales_channel ?? 'store') as SalesChannel
    const g = groups.find((x) => x.group === channelGroup(channel))!
    g.amount += row.total
    g.count += 1
    if (isOwnMoney(channel)) {
      g.ownAmount += row.total
      g.ownCount += 1
    }
    const line = (g.byChannel.find((c) => c.channel === channel)
      ?? (g.byChannel.push({ channel, amount: 0, count: 0 }), g.byChannel[g.byChannel.length - 1]))
    line.amount += row.total
    line.count += 1
  }

  for (const g of groups) g.byChannel.sort((a, b) => b.amount - a.amount)
  return groups
}
