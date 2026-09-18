/**
 * จำกัดจำนวนครั้งที่เรียก API แบบง่าย ๆ เก็บในหน่วยความจำของ instance
 *
 * ข้อจำกัดที่ต้องรู้: Vercel รันหลาย instance และรีไซเคิลเรื่อย ๆ ตัวนับจึงไม่ครบถ้วน
 * ของจริงควรใช้ Upstash Redis หรือ Vercel KV — อันนี้แค่กันยิงรัวจากเครื่องเดียว
 * ซึ่งพอสำหรับสกัดการไล่เดาเบอร์โทรทีละหมื่นครั้ง
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** ล้างของหมดอายุเป็นครั้งคราว กัน map โตไม่จำกัด */
function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key)
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSeconds: 0 }
  }

  bucket.count += 1
  if (bucket.count > limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  return { ok: true, retryAfterSeconds: 0 }
}

/** ip ของผู้เรียก — หลัง proxy ของ Vercel ใช้ x-forwarded-for */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  return fwd?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
}
