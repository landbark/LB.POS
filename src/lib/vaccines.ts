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
