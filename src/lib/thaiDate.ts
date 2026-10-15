// วันของร้านอิงเวลาไทย (UTC+7) — server บน Vercel รันเป็น UTC และเบราว์เซอร์ก็คืน UTC จาก
// toISOString() เหมือนกัน ถ้าเอา `new Date().toISOString().split('T')[0]` มาใช้เป็น "วันนี้"
// วันจะเปลี่ยนตอน 07:00 น. เวลาไทย ไม่ใช่เที่ยงคืน — ยอดขายวันนี้เลยค้างยอดเมื่อวานถึงเช้า

/** วันนี้ตามเวลาไทย เป็น 'YYYY-MM-DD' */
export function thaiToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** วันที่ห่างจากวันนี้ n วัน ตามเวลาไทย (ติดลบได้) */
export function thaiDateIn(days: number) {
  return new Date(Date.now() + days * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** เดือนนี้วันที่ 1 ตามเวลาไทย */
export function thaiMonthStart() {
  return thaiToday().slice(0, 7) + '-01'
}

/**
 * ขอบเขตของวันไทยเป็น UTC ไว้เทียบกับคอลัมน์ timestamptz (created_at, scheduled_at)
 * ใช้แบบ `.gte('created_at', startISO).lt('created_at', endISO)` — ปลายเปิด ไม่นับคาบเกี่ยววันถัดไป
 */
export function thaiDayRange(date = thaiToday()) {
  const startISO = new Date(`${date}T00:00:00+07:00`).toISOString()
  return { startISO, endISO: new Date(new Date(startISO).getTime() + 86400_000).toISOString() }
}
