// ตรรกะ "วัคซีนครบกำหนด" — ใช้ร่วมกันทั้งหน้า /admin/vaccines และตัวเตือน Telegram
//
// นิยาม: ต่อ 1 สัตว์ + 1 ชนิดวัคซีน ให้ดูเข็มล่าสุด ถ้าเข็มล่าสุดตั้งวันนัดถัดไปไว้
// และวันนัดนั้นถึง/เลยกำหนดในกรอบเวลาที่กำหนด = ครบกำหนดกระตุ้น
// (เข็มเก่ากว่าถูก superseded ด้วยเข็มใหม่ ไม่นับซ้ำ)
//
// เลยกำหนดเกินจำนวนวันที่ตั้งไว้แล้วเลิกเตือน — ตามไม่กลับแล้วก็ไม่ต้องรกรายการทุกวัน
// วันนัดเดิมยังอยู่ใน pet_vaccinations เหมือนเดิม (หน้าโปรไฟล์สัตว์ยังโชว์ "นัดถัดไป")
// ปรับจำนวนวันได้ที่หน้า /admin/notifications → notify_settings.vaccine_overdue_grace_days

/** เลยกำหนดได้กี่วันก่อนเลิกเตือน เมื่อยังไม่ได้ตั้งค่าไว้ (ยังเก็บวันนัดไว้ในระบบ) */
export const OVERDUE_GRACE_DAYS = 30

/**
 * อ่านค่าจาก notify_settings — ก่อนรัน migration คอลัมน์ยังไม่มี (undefined) ให้ถอยไปใช้ค่าเริ่มต้น
 * 0 = ไม่เลิกเตือน (เตือนต่อไปเรื่อย ๆ เหมือนก่อนมีการตั้งค่านี้)
 */
export function graceDaysFrom(settings: { vaccine_overdue_grace_days?: number | null } | null | undefined): number {
  const v = settings?.vaccine_overdue_grace_days
  return typeof v === 'number' && v >= 0 ? v : OVERDUE_GRACE_DAYS
}

export interface DueVaccinationRow {
  pet_id: string
  vaccine_name: string
  dose_date: string
  next_due_date: string | null
}

export interface DueVaccination<T extends DueVaccinationRow> {
  row: T
  overdue: boolean
}

/**
 * คืนเฉพาะเข็มล่าสุดต่อ (สัตว์+วัคซีน) ที่ถึงกำหนดกระตุ้นภายใน windowDays
 * (รวมที่เลยกำหนดแล้วไม่เกิน graceDays วัน — เลยกว่านั้นถือว่าเลิกเตือน, graceDays = 0 คือเตือนตลอด)
 */
export function dueVaccinations<T extends DueVaccinationRow>(
  rows: T[],
  todayISO: string,
  windowDays: number,
  graceDays: number = OVERDUE_GRACE_DAYS
): DueVaccination<T>[] {
  // เก็บเข็มล่าสุดต่อ pet+vaccine
  const latest = new Map<string, T>()
  for (const r of rows) {
    const key = `${r.pet_id}::${r.vaccine_name}`
    const cur = latest.get(key)
    if (!cur || r.dose_date > cur.dose_date) latest.set(key, r)
  }

  const limit = addDaysISO(todayISO, windowDays)
  const giveUpBefore = graceDays > 0 ? addDaysISO(todayISO, -graceDays) : null
  const due: DueVaccination<T>[] = []
  for (const r of latest.values()) {
    if (!r.next_due_date) continue
    if (r.next_due_date <= limit && (!giveUpBefore || r.next_due_date >= giveUpBefore)) {
      due.push({ row: r, overdue: r.next_due_date < todayISO })
    }
  }
  due.sort((a, b) => (a.row.next_due_date ?? '').localeCompare(b.row.next_due_date ?? ''))
  return due
}

export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/** วันเดิมของปีถัดไป (ประจำปี) — เปลี่ยนแค่ปี, 29 ก.พ. ตกไป 28 ก.พ. เมื่อปีถัดไปไม่ใช่ปีอธิกสุรทิน */
export function addYearsSameDate(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const ny = y + years
  const lastDayOfMonth = new Date(Date.UTC(ny, m, 0)).getUTCDate()
  const day = Math.min(d, lastDayOfMonth)
  return `${ny}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** คำนวณวันนัดกระตุ้นจากประเภท booster (แก้เลื่อนเองได้ทีหลัง) */
export function computeNextDue(doseISO: string, boosterType: string | null, customDays: number | null): string | null {
  if (!doseISO) return null
  switch (boosterType) {
    case '4w': return addDaysISO(doseISO, 28)
    case 'annual': return addYearsSameDate(doseISO, 1)
    case 'custom': return customDays ? addDaysISO(doseISO, customDays) : null
    default: return null
  }
}

export interface DuePet<T extends DueVaccinationRow> {
  petId: string
  /** เข็มที่ครบกำหนดของสัตว์ตัวนี้ เรียงตามวันนัดจากใกล้สุด */
  doses: DueVaccination<T>[]
  /** วันนัดที่ใกล้ที่สุด — ใช้เรียงลำดับรายการ */
  earliestDue: string
  /** มีอย่างน้อยหนึ่งเข็มที่เลยกำหนดแล้ว */
  overdue: boolean
}

/**
 * รวมผลจาก dueVaccinations() ให้เหลือสัตว์ละรายการ
 *
 * สัตว์ตัวหนึ่งมักครบกำหนดหลายเข็มพร้อมกัน (ฉีดวันเดียวกันก็ครบพร้อมกัน) แยกบรรทัดแล้ว
 * รายชื่อยาวเกินจริงและโทรตามซ้ำซ้อน — รวมเป็นตัวเดียวแล้วไล่เข็มข้างในแทน
 *
 * สัตว์ที่มีทั้งเข็มเกินกำหนดและเข็มที่ยังไม่ถึง ให้ถือว่าเกินกำหนด (overdue = true)
 * จะได้ไม่โผล่สองที่ แล้วค่อยดูสถานะรายเข็มในนั้น
 */
export function groupDueByPet<T extends DueVaccinationRow>(due: DueVaccination<T>[]): DuePet<T>[] {
  const byPet = new Map<string, DueVaccination<T>[]>()
  for (const d of due) {
    const list = byPet.get(d.row.pet_id)
    if (list) list.push(d)
    else byPet.set(d.row.pet_id, [d])
  }

  const pets = Array.from(byPet, ([petId, doses]) => {
    doses.sort((a, b) => (a.row.next_due_date ?? '').localeCompare(b.row.next_due_date ?? ''))
    return {
      petId,
      doses,
      earliestDue: doses[0].row.next_due_date ?? '',
      overdue: doses.some((d) => d.overdue),
    }
  })
  pets.sort((a, b) => a.earliestDue.localeCompare(b.earliestDue))
  return pets
}
