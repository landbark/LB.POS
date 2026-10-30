/**
 * ตัวตั้งเวลาของ POS — แทน "crons" ใน vercel.json
 *
 * ทำไมแยกเป็น worker ของตัวเอง ไม่ยัดเข้าไปในตัวเว็บ:
 * Cron Trigger ของ Cloudflare ต้องมี handler ชื่อ `scheduled` ซึ่ง worker ที่
 * OpenNext สร้างให้ไม่มี จะเพิ่มได้ต้องเขียน entry ครอบของเราเองทับของ adapter
 * — พลาดเมื่อไหร่คือทั้งร้านล่ม ไม่ใช่แค่แจ้งเตือนไม่เข้า
 * worker นี้จึงแค่ยิง HTTPS เข้าเว็บเหมือนที่ Vercel Cron ทำอยู่ทุกวันนี้
 * พฤติกรรมฝั่งเว็บจึงไม่เปลี่ยนเลย และถ้าตัวนี้พังก็ไม่กระทบการขาย
 */

interface CronEnv {
  POS_URL: string
  // ค่าเดียวกับที่ตั้งไว้ในตัวเว็บ — route ฝั่งนั้นเช็ค Authorization: Bearer เอง
  CRON_SECRET: string
}

// ตารางเดียวกับที่ประกาศไว้ใน wrangler.jsonc
const JOBS: Record<string, string> = {
  '0 1 * * *': '/api/cron/stock-alerts',
  '0 13 * * *': '/api/cron/daily-summary',
}

const cron = {
  async scheduled(event: ScheduledController, env: CronEnv) {
    const path = JOBS[event.cron]
    if (!path) {
      console.error(`ไม่รู้จักตารางเวลา ${event.cron} — ไม่ได้ยิงอะไรเลย`)
      return
    }

    const res = await fetch(new URL(path, env.POS_URL), {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    })

    const body = await res.text()
    if (!res.ok) {
      // โยนต่อเพื่อให้ขึ้นเป็น error ใน observability ไม่ใช่เงียบหาย
      throw new Error(`${path} ตอบ ${res.status}: ${body.slice(0, 300)}`)
    }
    console.log(`${path} ok: ${body.slice(0, 300)}`)
  },
}

export default cron
