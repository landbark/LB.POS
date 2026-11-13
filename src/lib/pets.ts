import type { Pet } from './types'

/** ชื่อพันธุ์แบบแสดงผล "English / ไทย" — มีภาษาเดียวก็ใช้ภาษานั้น (เก็บลง pets.breed ด้วย) */
export function composeBreed(en: string, th: string): string {
  const e = en.trim()
  const t = th.trim()
  if (e && t) return `${e} / ${t}`
  return e || t
}

/** อายุ ณ วันที่กำหนด แบบอ่านง่าย เช่น "2 ปี 3 เดือน" / "5 เดือน" */
export function ageAt(birthDate: string | null, atDate: string | Date): string | null {
  if (!birthDate) return null

  const born = new Date(birthDate)
  const at = typeof atDate === 'string' ? new Date(atDate) : atDate
  let months = (at.getFullYear() - born.getFullYear()) * 12 + (at.getMonth() - born.getMonth())
  if (at.getDate() < born.getDate()) months -= 1
  if (months < 0) return null

  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return `${rest} เดือน`
  if (rest === 0) return `${years} ปี`
  return `${years} ปี ${rest} เดือน`
}

/** อายุตอนนี้ — ยังไม่ได้กรอกวันเกิดคืน null */
export function petAge(birthDate: string | null): string | null {
  return ageAt(birthDate, new Date())
}

/** สัตว์ตัวนี้เท่าที่แถบเตือนต้องรู้ — ไม่ผูกกับ Pet ทั้งก้อน เพราะบางหน้าดึงมาไม่ครบคอลัมน์ */
export type PetAlertFields = Pick<Pet, 'caution' | 'allergies' | 'chronic_conditions'> &
  Partial<Pick<Pet, 'notes'>>

/**
 * ข้อความที่ต้องขึ้นเตือนก่อนจับตัวสัตว์หรือจ่ายยา — เรียงตามความด่วน
 *
 * ข้อควรระวังมาก่อนเสมอ เพราะเป็นเรื่องความปลอดภัยของคนที่ยืนอยู่ตรงนั้น
 * (ดุ/กัด/ต้องใส่ตะกร้อ) ส่วนแพ้ยากับโรคประจำตัวเป็นเรื่องตอนจ่ายยา
 */
export function petWarnings(pet: PetAlertFields): string[] {
  const warnings: string[] = []
  if (pet.caution?.trim()) warnings.push(`ระวัง: ${pet.caution.trim()}`)
  if (pet.allergies?.trim()) warnings.push(`แพ้: ${pet.allergies.trim()}`)
  if (pet.chronic_conditions?.trim()) warnings.push(`โรคประจำตัว: ${pet.chronic_conditions.trim()}`)
  return warnings
}

/** มีอะไรต้องเตือนไหม — ใช้ตัดสินว่าจะโผล่แถบเตือนไหม โดยไม่ต้องสร้าง array ทิ้ง */
export const hasPetWarning = (pet: PetAlertFields): boolean =>
  !!(pet.caution?.trim() || pet.allergies?.trim() || pet.chronic_conditions?.trim())
