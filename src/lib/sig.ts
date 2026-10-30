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

/**
 * รูปแบบยา — ดูจากหน่วยขาย เพราะร้านตั้งหน่วยตามของจริงอยู่แล้ว
 *   ml./cc  = ยาฉีด (คิดเงินตามปริมาตร)
 *   ขวด     = ยาน้ำ (จ่ายเป็นขวด แต่ขนาดใช้บอกเป็น ml เช่น ครั้งละ 2.5 ml)
 *   หลอด    = ยาทา (ไม่มีขนาดต่อครั้ง บอกแค่วันละกี่ครั้ง)
 *   ที่เหลือ = เม็ด/แคปซูล/ซอง (นับเป็นเม็ด มีเศษได้)
 */
export type DrugForm = 'solid' | 'liquid' | 'topical' | 'injection'

export function drugForm(unit: string | null | undefined): DrugForm {
  const u = (unit ?? '').trim().toLowerCase()
  if (/^(ml|cc|มล)\.?$/.test(u)) return 'injection'
  if (/^(ขวด|bottle|ออนซ์|oz\.?)$/.test(u)) return 'liquid'
  if (/^(หลอด|tube|กระปุก|jar)$/.test(u)) return 'topical'
  return 'solid'
}

/**
 * ยาที่หมอฉีด/ให้ที่ร้าน — ดูจากหน่วยขาย (ml. / cc. / มล. / amp / vial)
 * กว้างกว่า drugForm() ที่ดูแค่ ml/cc เพราะ amp กับ vial ก็เป็นยาฉีด
 * แต่ต้องกรอกขนาดต่อครั้งเป็นหน่วยเต็มเหมือนยาเม็ด จึงแยกฟังก์ชันไว้ ไม่ไปแก้ drugForm
 */
export function isInjectionUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? '').trim().toLowerCase()
  return /^(ml|cc|มล|amp|amps|ampoule|vial|แอมป์|ไวแอล)\.?$/.test(u)
}

/** ช่วงเวลาให้ยาในหนึ่งวัน — หมอเลือกเองได้ว่าเม็ดไหนให้ตอนไหน */
export const TIME_SLOTS = [
  { value: 'morning', th: 'เช้า', en: 'morning' },
  { value: 'noon', th: 'กลางวัน', en: 'noon' },
  { value: 'evening', th: 'เย็น', en: 'evening' },
  { value: 'bedtime', th: 'ก่อนนอน', en: 'bedtime' },
] as const

export type TimeSlot = (typeof TIME_SLOTS)[number]['value']

/** เวลาที่ใช้เมื่อหมอไม่ได้เลือกเอง — เหมือนที่ระบบเคยเดาให้ตายตัว */
export function defaultTimes(frequency: Frequency | null): TimeSlot[] {
  switch (frequency) {
    case 'sid': return ['morning']
    case 'bid': return ['morning', 'evening']
    case 'tid': return ['morning', 'noon', 'evening']
    case 'qid': return ['morning', 'noon', 'evening', 'bedtime']
    default: return []
  }
}

/** อ่านค่าที่เก็บไว้ ('morning,evening') — ของเก่าเป็น NULL จะได้รายการว่าง */
export function parseTimes(raw: string | null | undefined): TimeSlot[] {
  if (!raw) return []
  const valid = TIME_SLOTS.map((t) => t.value) as readonly string[]
  return raw.split(',').map((x) => x.trim()).filter((x): x is TimeSlot => valid.includes(x))
}

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

// ข้อความ "วันละ N ครั้ง (เช้า-เย็น)" ประกอบจากเวลาที่หมอเลือก ไม่ใช่ข้อความสำเร็จรูปตายตัว
function timesText(frequency: Frequency, slots: TimeSlot[], lang: 'th' | 'en', form: DrugForm): string | null {
  if (frequency === 'prn') {
    if (form === 'topical') return lang === 'th' ? 'ทาเมื่อมีอาการ' : 'Apply as needed'
    return lang === 'th' ? 'กินเมื่อมีอาการ' : 'as needed'
  }
  const perDay = dosesPerDay(frequency, null)
  if (!perDay) return null
  const picked = slots.length > 0 ? slots : defaultTimes(frequency)
  const names = picked.map((v) => {
    const slot = TIME_SLOTS.find((t) => t.value === v)!
    return lang === 'th' ? slot.th : slot.en
  })
  if (lang === 'en') {
    const word = perDay === 1 ? 'once' : perDay === 2 ? 'twice' : `${perDay} times`
    return names.length > 0 ? `${word} daily (${names.join(', ')})` : `${word} daily`
  }
  return names.length > 0 ? `วันละ ${perDay} ครั้ง (${names.join('-')})` : `วันละ ${perDay} ครั้ง`
}
const FOOD_TH: Record<FoodTiming, string> = { ac: 'ก่อนอาหาร', pc: 'หลังอาหาร', wm: 'พร้อมอาหาร' }
const FOOD_EN: Record<FoodTiming, string> = { ac: 'before meals', pc: 'after meals', wm: 'with food' }

export interface SigInput {
  dose_amount: number | null
  frequency: Frequency | null
  frequency_hours: number | null
  food_timing: FoodTiming | null
  duration_days: number | null
  /** เวลาที่ให้ยา คั่นด้วยจุลภาค เช่น 'morning,evening' — ว่างไว้ = ใช้ค่าเริ่มต้นตามความถี่ */
  dose_times?: string | null
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
  const form = drugForm(sig.unit)
  const unit = lang === 'en' ? '' : sig.unit

  // ยาทาไม่มีขนาดต่อครั้ง — บีบหลอดเท่าไรไม่มีใครตวง บอกแค่วันละกี่ครั้งก็พอ
  if (form !== 'topical' && sig.dose_amount) {
    if (form === 'liquid') {
      // ยาน้ำ: ขายเป็นขวด แต่ขนาดที่ป้อนบอกเป็น ml เสมอ
      const ml = +sig.dose_amount.toFixed(2)
      parts.push(lang === 'th' ? `ครั้งละ ${ml} ml` : `Take ${ml} ml`)
    } else {
      parts.push(lang === 'th'
        ? `ครั้งละ ${amountText(sig.dose_amount, unit, 'th')}`
        : `Take ${amountText(sig.dose_amount, sig.unit, 'en')}`)
    }
  }

  if (sig.frequency === 'q_h' && sig.frequency_hours) {
    const every = lang === 'th' ? `ทุกๆ ${sig.frequency_hours} ชั่วโมง` : `every ${sig.frequency_hours} hours`
    parts.push(form === 'topical' ? (lang === 'th' ? `ทา${every}` : `Apply ${every}`) : every)
  } else if (sig.frequency) {
    const t = timesText(sig.frequency, parseTimes(sig.dose_times), lang, form)
    if (t) parts.push(form === 'topical' && sig.frequency !== 'prn'
      ? (lang === 'th' ? `ทา${t}` : `Apply ${t}`)
      : t)
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

// ── ชื่อ/สรรพคุณ/ยี่ห้อ ที่จะขึ้นบนฉลาก ────────────────────────────────────
/** ฟิลด์ฉลากของสินค้า (ส่ง products ที่ select มาเฉพาะคอลัมน์เหล่านี้ได้เลย) */
export interface DrugLabelFields {
  name: string
  label_name?: string | null
  label_name_en?: string | null
  indication?: string | null
  indication_en?: string | null
  brand?: string | null
}

/** ชื่อที่พิมพ์บนฉลาก — ไม่ได้กำหนดไว้ก็ใช้ชื่อในสต็อก */
export function labelName(p: DrugLabelFields, lang: 'th' | 'en' = 'th'): string {
  if (lang === 'en') return p.label_name_en?.trim() || p.label_name?.trim() || p.name
  return p.label_name?.trim() || p.name
}

/** สรรพคุณกำกับบนฉลาก — ฉลากอังกฤษที่ไม่ได้กรอกช่อง en ใช้ข้อความไทยไปก่อน ดีกว่าว่างเปล่า */
export function labelIndication(p: DrugLabelFields, lang: 'th' | 'en' = 'th'): string | null {
  const th = p.indication?.trim() || null
  if (lang === 'en') return p.indication_en?.trim() || th
  return th
}
