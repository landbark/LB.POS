// ช่องเวลานัด ทุก 30 นาที 13:00 ถึง 19:30 (เจ้าของกำหนด 24 พ.ย. 69 — ไม่เปิดรับนัดช่วงเช้า)
// เวลาเดียวกันนัดซ้ำได้หลายตัว ช่องจึงไม่มีคำว่า "เต็ม" มีแต่บอกว่านัดไปแล้วกี่ตัว
export const SLOT_MINUTES = 30
const FIRST_MINUTE = 13 * 60
const LAST_MINUTE = 19 * 60 + 30

const pad = (n: number) => String(n).padStart(2, '0')
const toTime = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`

export const APPOINTMENT_SLOTS: string[] = Array.from(
  { length: (LAST_MINUTE - FIRST_MINUTE) / SLOT_MINUTES + 1 },
  (_, i) => toTime(FIRST_MINUTE + i * SLOT_MINUTES)
)

/** ช่องที่เวลานี้ตกอยู่ — นัดเก่าที่พิมพ์เวลาเอง (เช่น 13:40) นับเข้าช่อง 13:30 */
export function slotOf(date: Date): string {
  const minute = date.getHours() * 60 + date.getMinutes()
  return toTime(minute - (minute % SLOT_MINUTES))
}

/** แบ่งช่วงให้กวาดตาหาง่าย — นัดเก่านอกช่วงนี้ (เช่น 09:00) เพิ่มช่องให้ด้วย จะได้ไม่หายไปจากสายตา */
export function slotGroups(extra: string[] = []): { label: string; slots: string[] }[] {
  const all = [...new Set([...APPOINTMENT_SLOTS, ...extra])].sort()
  return [
    { label: 'เช้า', slots: all.filter((s) => s < '12:00') },
    { label: 'บ่าย', slots: all.filter((s) => s >= '12:00' && s < '17:00') },
    { label: 'เย็น', slots: all.filter((s) => s >= '17:00') },
  ].filter((g) => g.slots.length > 0)
}
