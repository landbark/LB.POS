// คีย์บิลย้อนหลัง — ขายไปแล้วตอนเน็ตล่ม/ไฟดับ แล้วมาคีย์ตามทีหลัง
//
// บิลย้อนหลังเก็บ "เวลาที่ขายจริง" ลง transactions.created_at ตรง ๆ เพราะทุกรายงานในระบบ
// (สรุปกะ · สรุปรายวัน · รายงาน VAT · ทะเบียนใบเสร็จ · ใบเสร็จที่พิมพ์) อ่านคอลัมน์นี้
// เป็นเวลาที่ขายอยู่แล้ว — บิลจึงไปโผล่ในวันที่ขายจริงเองโดยไม่ต้องแก้รายงานสักหน้า
// ส่วนเวลาที่คีย์เข้าระบบ trigger ฝั่ง DB เขียนลง recorded_at ให้เอง (ดู migration)
//
// ขอบเขตตรงนี้ต้องตรงกับ trigger ใน supabase-migration-backdate.sql เป๊ะ ๆ ไม่งั้นหน้าเว็บ
// จะปล่อยให้กดยืนยันแล้วค่อยไปเด้ง error จาก Postgres ซึ่งอ่านไม่รู้เรื่องสำหรับแคชเชียร์

/** ย้อนหลังได้ไม่เกินกี่วัน */
export const BACKDATE_MAX_DAYS = 7

/** ห่างจากเวลาจริงไม่ถึงเท่านี้ = ยังเป็นบิลปกติ (เผื่อนาฬิกาเครื่องเพี้ยน/เน็ตหน่วง) */
export const BACKDATE_MIN_MINUTES = 2

const DAY_MS = 86_400_000

/** ค่าสำหรับ <input type="datetime-local"> — ต้องเป็นเวลาท้องถิ่นของเครื่อง ไม่ใช่ UTC */
export function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** ช่วงที่เลือกได้ในช่องกรอก — เบราว์เซอร์กันให้อีกชั้นก่อนถึง validateBackdate */
export function inputBounds(now: Date = new Date()): { min: string; max: string } {
  return {
    min: toInputValue(new Date(now.getTime() - BACKDATE_MAX_DAYS * DAY_MS)),
    max: toInputValue(now),
  }
}

export type BackdateCheck =
  | { ok: true; at: Date; /** ใกล้เวลาจริงเกินกว่าจะนับเป็นบิลย้อนหลัง */ negligible: boolean }
  | { ok: false; error: string }

export function validateBackdate(value: string, now: Date = new Date()): BackdateCheck {
  if (!value.trim()) return { ok: false, error: 'ใส่วันเวลาที่ขายด้วย' }

  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return { ok: false, error: 'วันเวลาไม่ถูกต้อง' }

  // เผื่อ 1 นาที กันกรณีผู้ใช้เลือก "ตอนนี้" แล้วนาทีเปลี่ยนก่อนกดยืนยัน
  if (at.getTime() > now.getTime() + 60_000) return { ok: false, error: 'ลงวันขายล่วงหน้าไม่ได้' }

  if (at.getTime() < now.getTime() - BACKDATE_MAX_DAYS * DAY_MS) {
    return { ok: false, error: `คีย์ย้อนหลังได้ไม่เกิน ${BACKDATE_MAX_DAYS} วัน` }
  }

  return { ok: true, at, negligible: at.getTime() > now.getTime() - BACKDATE_MIN_MINUTES * 60_000 }
}

/** วันเวลาแบบไทยสำหรับโชว์ให้แคชเชียร์ยืนยันก่อนกด */
export function fmtThai(d: Date | string): string {
  return new Date(d).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * บิลย้อนหลังที่ขายก่อนกะที่เปิดอยู่ — เงินสดบิลนั้นไม่เข้าสูตร "เงินที่ควรมี" ของกะนี้
 * (สรุปกะกรองบิลด้วย created_at >= opened_at) ต้องเตือนก่อน ไม่ใช่ปล่อยให้ไปงงตอนปิดกะ
 */
export function fallsBeforeShift(at: Date, shiftOpenedAt: string | null): boolean {
  if (!shiftOpenedAt) return false
  return at.getTime() < new Date(shiftOpenedAt).getTime()
}
