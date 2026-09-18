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

/** ip ของผู้เรียก — หลัง proxy ของ Vercel ใช้ x-forwarded-for */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  return fwd?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
}
