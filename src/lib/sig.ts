import type { Frequency, FoodTiming } from '@/lib/types'

// ── ตัวเลือกให้หมอกรอก (ใช้ศัพท์แพทย์) ──────────────────────────────────────
export const FREQUENCY_OPTIONS: { value: Frequency; label: string; perDay: number | null }[] = [
  { value: 'sid', label: 'SID — วันละครั้ง', perDay: 1 },
  { value: 'bid', label: 'BID — วันละ 2 ครั้ง', perDay: 2 },
  { value: 'tid', label: 'TID — วันละ 3 ครั้ง', perDay: 3 },
  { value: 'qid', label: 'QID — วันละ 4 ครั้ง', perDay: 4 },
  { value: 'q_h', label: 'ทุกๆ ... ชั่วโมง', perDay: null },
  { value: 'prn', label: 'PRN — เมื่อมีอาการ', perDay: null },
]

export const FOOD_OPTIONS: { value: FoodTiming; label: string }[] = [
  { value: 'ac', label: 'AC — ก่อนอาหาร' },
  { value: 'pc', label: 'PC — หลังอาหาร' },
  { value: 'wm', label: 'WM — พร้อมอาหาร' },
]

/** จำนวนครั้งต่อวัน — PRN ไม่แน่นอน คืน null */
export function dosesPerDay(frequency: Frequency | null, hours: number | null): number | null {
  switch (frequency) {
    case 'sid': return 1
    case 'bid': return 2
    case 'tid': return 3
    case 'qid': return 4
    case 'q_h': return hours && hours > 0 ? 24 / hours : null
    default: return null   // prn / ยังไม่เลือก
  }
}

/** จำนวนยาที่ต้องจ่าย — ปัดขึ้นเป็นจำนวนเต็ม เพราะจ่ายเศษเม็ดออกไปไม่ได้ */
export function suggestedQuantity(
  dose: number | null, frequency: Frequency | null, hours: number | null, days: number | null
): number | null {
  const perDay = dosesPerDay(frequency, hours)
  if (!dose || !perDay || !days) return null
  return Math.ceil(dose * perDay * days - 1e-9)
}

// ── แปลงเป็นข้อความบนฉลาก ──────────────────────────────────────────────────
const FRACTIONS: { value: number; th: string; glyph: string; en: string }[] = [
  { value: 0.25, th: 'เศษหนึ่งส่วนสี่', glyph: '¼', en: '1/4' },
  { value: 1 / 3, th: 'เศษหนึ่งส่วนสาม', glyph: '⅓', en: '1/3' },
  { value: 0.5, th: 'ครึ่ง', glyph: '½', en: '1/2' },
  { value: 2 / 3, th: 'เศษสองส่วนสาม', glyph: '⅔', en: '2/3' },
  { value: 0.75, th: 'เศษสามส่วนสี่', glyph: '¾', en: '3/4' },
]

// หน่วยไทย → อังกฤษ สำหรับฉลากภาษาอังกฤษ (ไม่รู้จักก็ใช้ของเดิม)
const UNIT_EN: Record<string, [string, string]> = {
  'เม็ด': ['tablet', 'tablets'],
  'แคปซูล': ['capsule', 'capsules'],
  'ซอง': ['sachet', 'sachets'],
  'ขวด': ['bottle', 'bottles'],
  'หลอด': ['tube', 'tubes'],
  'amp': ['amp', 'amps'],
  'ml.': ['ml', 'ml'],
  'cc': ['cc', 'cc'],
  'ชิ้น': ['piece', 'pieces'],
  'โดส': ['dose', 'doses'],
}

function unitEn(unit: string, plural: boolean): string {
  const hit = UNIT_EN[unit.trim()]
  if (!hit) return unit
  return plural ? hit[1] : hit[0]
}

function amountText(dose: number, unit: string, lang: 'th' | 'en'): string {
  const whole = Math.floor(dose + 1e-9)
  const frac = dose - whole
  const hit = FRACTIONS.find((f) => Math.abs(f.value - frac) < 0.02)

  if (lang === 'en') {
    const u = unitEn(unit, dose > 1)
    if (!hit) return `${+dose.toFixed(2)} ${u}`.trim()
    return `${whole > 0 ? `${whole} ` : ''}${hit.en} ${u}`.trim()
  }

  // ไทยแบบที่คนทั่วไปอ่านออก: ครึ่งเม็ด · ¼ เม็ด · 1 เม็ดครึ่ง · 1¼ เม็ด
  if (!hit) return `${+dose.toFixed(2)} ${unit}`.trim()
  if (whole === 0) return hit.value === 0.5 ? `ครึ่ง${unit}` : `${hit.glyph} ${unit}`.trim()
  if (hit.value === 0.5) return `${whole} ${unit}ครึ่ง`
  return `${whole}${hit.glyph} ${unit}`.trim()
}

const TIMES_TH: Record<string, string> = {
  sid: 'วันละ 1 ครั้ง (เช้า)',
  bid: 'วันละ 2 ครั้ง (เช้า-เย็น)',
  tid: 'วันละ 3 ครั้ง (เช้า-กลางวัน-เย็น)',
  qid: 'วันละ 4 ครั้ง (เช้า-กลางวัน-เย็น-ก่อนนอน)',
  prn: 'กินเมื่อมีอาการ',
}
const TIMES_EN: Record<string, string> = {
  sid: 'once daily (morning)',
  bid: 'twice daily (morning & evening)',
  tid: 'three times daily (morning, noon, evening)',
  qid: 'four times daily (morning, noon, evening, bedtime)',
  prn: 'as needed',
}
const FOOD_TH: Record<FoodTiming, string> = { ac: 'ก่อนอาหาร', pc: 'หลังอาหาร', wm: 'พร้อมอาหาร' }
const FOOD_EN: Record<FoodTiming, string> = { ac: 'before meals', pc: 'after meals', wm: 'with food' }

export interface SigInput {
  dose_amount: number | null
  frequency: Frequency | null
  frequency_hours: number | null
  food_timing: FoodTiming | null
  duration_days: number | null
  /** หน่วยของสินค้า เช่น เม็ด / ซอง / ml. */
  unit: string
  /** หมอพิมพ์เพิ่มเอง — ต่อท้ายข้อความที่ระบบสร้าง */
  note?: string | null
}

/**
 * ข้อความวิธีใช้บนฉลาก — ภาษาคนทั่วไปอ่าน ไม่ใช่ศัพท์แพทย์
 * ไทย: "ครั้งละ 2 เม็ด วันละ 2 ครั้ง (เช้า-เย็น) หลังอาหาร ติดต่อกัน 7 วัน"
 */
export function sigText(sig: SigInput, lang: 'th' | 'en' = 'th'): string {
  const parts: string[] = []
  const unit = lang === 'en' ? '' : sig.unit

  if (sig.dose_amount) {
    parts.push(lang === 'th'
      ? `ครั้งละ ${amountText(sig.dose_amount, unit, 'th')}`
      : `Take ${amountText(sig.dose_amount, sig.unit, 'en')}`)
  }

  if (sig.frequency === 'q_h' && sig.frequency_hours) {
    parts.push(lang === 'th' ? `ทุกๆ ${sig.frequency_hours} ชั่วโมง` : `every ${sig.frequency_hours} hours`)
  } else if (sig.frequency) {
    const t = (lang === 'th' ? TIMES_TH : TIMES_EN)[sig.frequency]
    if (t) parts.push(t)
  }

  if (sig.food_timing) parts.push((lang === 'th' ? FOOD_TH : FOOD_EN)[sig.food_timing])

  if (sig.duration_days) {
    parts.push(lang === 'th'
      ? `ติดต่อกัน ${sig.duration_days} วัน`
      : `for ${sig.duration_days} day${sig.duration_days > 1 ? 's' : ''}`)
  }

  const base = parts.join(' ')
  const note = sig.note?.trim()
  return [base, note].filter(Boolean).join(lang === 'th' ? ' · ' : ' · ')
}
