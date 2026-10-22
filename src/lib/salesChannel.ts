import type { SalesChannel } from '@/lib/types'

export const SALES_CHANNELS: { value: SalesChannel; label: string; short: string }[] = [
  { value: 'store', label: 'หน้าร้าน', short: 'หน้าร้าน' },
  { value: 'shopee', label: 'Shopee', short: 'Shopee' },
  { value: 'tiktok', label: 'TikTok', short: 'TikTok' },
  { value: 'lazada', label: 'Lazada', short: 'Lazada' },
  { value: 'booth', label: 'งานออกบูธ', short: 'ออกบูธ' },
]

export const CHANNEL_LABEL: Record<SalesChannel, string> =
  Object.fromEntries(SALES_CHANNELS.map((c) => [c.value, c.label])) as Record<SalesChannel, string>

// สีประจำช่องทาง (ใกล้เคียงสีแบรนด์ของแต่ละแพลตฟอร์ม) — ใช้กับ badge ในตารางและสรุปรายวัน
export const CHANNEL_BADGE: Record<SalesChannel, string> = {
  store: 'bg-gray-100 text-gray-600',
  shopee: 'bg-orange-100 text-orange-700',
  tiktok: 'bg-neutral-900 text-white',
  lazada: 'bg-indigo-100 text-indigo-700',
  booth: 'bg-amber-100 text-amber-800',
}

/**
 * ขายผ่านแพลตฟอร์ม = เงินเข้าผ่านระบบของเขา ไม่ได้รับเงินเอง
 *
 * บูธไม่นับเป็นออนไลน์ — รับเงินสด/โอน/สแกนจ่ายเองที่หน้างานเหมือนหน้าร้าน
 */
export const isOnlineChannel = (c: SalesChannel) => c !== 'store' && c !== 'booth'

/**
 * บิลนี้นับเป็น "เงินที่ร้านรับเอง" ไหม
 *
 * ขายผ่านแพลตฟอร์มไม่ได้เงินเท่าราคาที่ลงบิล — โดนหักค่าธรรมเนียม/ค่าส่ง/ส่วนลดแพลตฟอร์ม
 * แล้วโอนเข้าบัญชีทีหลังเป็นรอบ ตัวเลขจริงดูจากสรุปการเงินของแพลตฟอร์มเท่านั้น
 * POS บันทึกไว้แค่ตัดสต็อก ยอดจึงไม่เข้าสรุปรายวัน/ปิดกะ/วิธีชำระ
 */
export const isOwnMoney = (c: SalesChannel | null | undefined) => !isOnlineChannel(c ?? 'store')
