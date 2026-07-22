import type { Pet } from './types'

/** อายุแบบอ่านง่าย เช่น "2 ปี 3 เดือน" / "5 เดือน" — ยังไม่ได้กรอกวันเกิดคืน null */
export function petAge(birthDate: string | null): string | null {
  if (!birthDate) return null

  const born = new Date(birthDate)
  const now = new Date()
  let months = (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth())
  if (now.getDate() < born.getDate()) months -= 1
  if (months < 0) return null

  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return `${rest} เดือน`
  if (rest === 0) return `${years} ปี`
  return `${years} ปี ${rest} เดือน`
}

/** ข้อมูลที่หมอต้องเห็นก่อนจ่ายยาทุกครั้ง */
export function petWarnings(pet: Pet): string[] {
  const warnings: string[] = []
  if (pet.allergies?.trim()) warnings.push(`แพ้: ${pet.allergies.trim()}`)
  if (pet.chronic_conditions?.trim()) warnings.push(`โรคประจำตัว: ${pet.chronic_conditions.trim()}`)
  return warnings
}
