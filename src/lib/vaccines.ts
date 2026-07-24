// ตรรกะ "วัคซีนครบกำหนด" — ใช้ร่วมกันทั้งหน้า /admin/vaccines และตัวเตือน Telegram
//
// นิยาม: ต่อ 1 สัตว์ + 1 ชนิดวัคซีน ให้ดูเข็มล่าสุด ถ้าเข็มล่าสุดตั้งวันนัดถัดไปไว้
// และวันนัดนั้นถึง/เลยกำหนดในกรอบเวลาที่กำหนด = ครบกำหนดกระตุ้น
// (เข็มเก่ากว่าถูก superseded ด้วยเข็มใหม่ ไม่นับซ้ำ)

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

/** คืนเฉพาะเข็มล่าสุดต่อ (สัตว์+วัคซีน) ที่ถึงกำหนดกระตุ้นภายใน windowDays (รวมที่เลยกำหนดแล้ว) */
export function dueVaccinations<T extends DueVaccinationRow>(
  rows: T[],
  todayISO: string,
  windowDays: number
): DueVaccination<T>[] {
  // เก็บเข็มล่าสุดต่อ pet+vaccine
  const latest = new Map<string, T>()
  for (const r of rows) {
    const key = `${r.pet_id}::${r.vaccine_name}`
    const cur = latest.get(key)
    if (!cur || r.dose_date > cur.dose_date) latest.set(key, r)
  }

  const limit = addDaysISO(todayISO, windowDays)
  const due: DueVaccination<T>[] = []
  for (const r of latest.values()) {
    if (!r.next_due_date) continue
    if (r.next_due_date <= limit) {
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
