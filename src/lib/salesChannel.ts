import type { SalesChannel } from '@/lib/types'

export const SALES_CHANNELS: { value: SalesChannel; label: string; short: string }[] = [
  { value: 'store', label: 'หน้าร้าน', short: 'หน้าร้าน' },
  { value: 'shopee', label: 'Shopee', short: 'Shopee' },
  { value: 'tiktok', label: 'TikTok', short: 'TikTok' },
  { value: 'lazada', label: 'Lazada', short: 'Lazada' },
]

export const CHANNEL_LABEL: Record<SalesChannel, string> =
  Object.fromEntries(SALES_CHANNELS.map((c) => [c.value, c.label])) as Record<SalesChannel, string>

// สีประจำช่องทาง (ใกล้เคียงสีแบรนด์ของแต่ละแพลตฟอร์ม) — ใช้กับ badge ในตารางและสรุปรายวัน
export const CHANNEL_BADGE: Record<SalesChannel, string> = {
  store: 'bg-gray-100 text-gray-600',
  shopee: 'bg-orange-100 text-orange-700',
  tiktok: 'bg-neutral-900 text-white',
  lazada: 'bg-indigo-100 text-indigo-700',
}

export const isOnlineChannel = (c: SalesChannel) => c !== 'store'
