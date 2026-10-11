import type { RoundingMode } from '@/lib/types'

export const ROUNDING_OPTIONS: { value: RoundingMode; label: string; hint: string }[] = [
  { value: 'none', label: 'ไม่ปัดเศษ', hint: 'เก็บเงินตามยอดจริงทุกสตางค์' },
  { value: 'normal', label: 'ปัดตามปกติ', hint: 'ตั้งแต่ 50 สตางค์ขึ้นไปปัดขึ้น ต่ำกว่านั้นปัดลง' },
  { value: 'up', label: 'ปัดขึ้นเสมอ', hint: 'มีเศษสตางค์เท่าไหร่ก็ปัดขึ้นเป็นบาทถัดไป' },
  { value: 'down', label: 'ปัดลงเสมอ', hint: 'ตัดเศษสตางค์ทิ้งทั้งหมด' },
]

// ปัดเศษสตางค์ท้ายบิลให้ลงตัวเป็นบาท — คืนยอดที่ต้องเก็บจริงกับส่วนต่างที่ปัดไป
export function roundTotal(amount: number, mode: RoundingMode): { total: number; rounding: number } {
  if (mode === 'none' || !Number.isFinite(amount)) return { total: amount, rounding: 0 }

  // ปัดสองตำแหน่งก่อน กัน 0.1+0.2 = 0.30000000000000004 ทำให้ปัดผิดทาง
  const cents = Math.round(amount * 100)
  const rounded =
    mode === 'up' ? Math.ceil(cents / 100)
      : mode === 'down' ? Math.floor(cents / 100)
        : Math.round(cents / 100)

  const total = Math.max(0, rounded)
  return { total, rounding: Number((total - cents / 100).toFixed(2)) }
}
