import { createAdminClient } from '@/lib/supabase/admin'

/**
 * จำกัดจำนวนครั้งที่เรียก API — นับใน Postgres จึงรวมทุก instance
 *
 * Vercel รันหลาย instance พร้อมกัน ตัวนับที่เก็บในหน่วยความจำจะนับแยกกัน
 * ยิงกระจายไปหลาย instance ก็เลี่ยงลิมิตได้ ตัวนับกลางเท่านั้นที่กันได้จริง
 *
 * ถ้า DB ล่มหรือยังไม่ได้รัน migration จะถอยไปใช้ตัวนับในหน่วยความจำ
 * — หลวมกว่าแต่ยังดีกว่าปล่อยผ่านทั้งหมด และไม่ทำให้หน้าเว็บพัง
 */

export interface RateLimitResult {
  ok: boolean
  retryAfterSeconds: number
}

// ---------- ตัวนับสำรองในหน่วยความจำ ----------

const buckets = new Map<string, { count: number; resetAt: number }>()

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  if (buckets.size >= 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  }

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSeconds: 0 }
  }

  bucket.count += 1
  return bucket.count > limit
    ? { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
    : { ok: true, retryAfterSeconds: 0 }
}

// ---------- ตัวนับกลางใน Postgres ----------

export async function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(windowMs / 1000)

  try {
    const { data, error } = await createAdminClient().rpc('consume_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    })
    if (error) throw new Error(error.message)

    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('empty result')

    return {
      ok: row.allowed === true,
      retryAfterSeconds: Number(row.retry_after_seconds ?? windowSeconds),
    }
  } catch {
    return memoryLimit(key, limit, windowMs)
  }
}

/**
 * ip ของผู้เรียก — เอาค่าที่ "proxy ของเราเอง" เขียนให้ ไม่ใช่ค่าที่ client ส่งมา
 *
 * ห้ามอ่าน x-forwarded-for ตัวแรก: ทั้ง Cloudflare และ Caddy *ต่อท้าย* ip จริง
 * ลงไปในค่าที่ client ส่งมา ไม่ได้เขียนทับ ใครแนบ `X-Forwarded-For: <สุ่ม>`
 * มาเองทุกครั้งก็ได้ตัวนับใหม่ทุกครั้ง = ลิมิตไม่มีผลอะไรเลย
 *
 *   cf-connecting-ip  Cloudflare เขียนให้เสมอและเขียนทับของเดิม (เว็บจริงอยู่บน Workers)
 *   x-forwarded-for   เอาตัว "ท้ายสุด" คือตัวที่ proxy ชั้นใกล้เราที่สุดเติมเข้ามา
 *   x-real-ip         Caddy/nginx ตั้งให้เป็นค่าเดี่ยว (ตอนรันเป็น Docker)
 */
export function clientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf

  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) {
    const hops = fwd.split(',').map((h) => h.trim()).filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }

  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}
