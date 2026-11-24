// ช่องเวลานัด ทุก 30 นาที ตามเวลาร้าน 9:00-20:00 — ช่องสุดท้าย 19:30
// เวลาเดียวกันนัดซ้ำได้หลายตัว ช่องจึงไม่มีคำว่า "เต็ม" มีแต่บอกว่านัดไปแล้วกี่ตัว
export const SLOT_MINUTES = 30
const OPEN_MINUTE = 9 * 60
const CLOSE_MINUTE = 20 * 60

const pad = (n: number) => String(n).padStart(2, '0')
const toTime = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`

export const APPOINTMENT_SLOTS: string[] = Array.from(
  { length: (CLOSE_MINUTE - OPEN_MINUTE) / SLOT_MINUTES },
  (_, i) => toTime(OPEN_MINUTE + i * SLOT_MINUTES)
)

/** ช่องที่เวลานี้ตกอยู่ — นัดเก่าที่พิมพ์เวลาเอง (เช่น 13:40) นับเข้าช่อง 13:30 */
export function slotOf(date: Date): string {
  const minute = date.getHours() * 60 + date.getMinutes()
  return toTime(minute - (minute % SLOT_MINUTES))
}

/** แบ่งช่วงให้กวาดตาหาง่าย — นัดเก่านอกเวลาร้าน (ถ้ามี) เพิ่มช่องให้ด้วย จะได้ไม่หายไปจากสายตา */
export function slotGroups(extra: string[] = []): { label: string; slots: string[] }[] {
  const all = [...new Set([...APPOINTMENT_SLOTS, ...extra])].sort()
  return [
    { label: 'เช้า', slots: all.filter((s) => s < '12:00') },
    { label: 'บ่าย', slots: all.filter((s) => s >= '12:00' && s < '17:00') },
    { label: 'เย็น', slots: all.filter((s) => s >= '17:00') },
  ]
}
