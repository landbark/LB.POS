import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * ยิงโดย worker ตั้งเวลาทุกเช้า (ดู workers/cron/) — ตัดแต้มที่หมดอายุออกจากยอดลูกค้า
 *
 * ก้อนแต้มไม่ได้ถูกลบ แค่ไม่ถูกนับในยอดรวมอีกต่อไป จะได้ตอบลูกค้าได้ว่าแต้มหายไปเพราะอะไร
 * ยอดของลูกค้าที่มาซื้อของถูกคิดใหม่ตอนปิดบิลอยู่แล้ว งานนี้จึงมีไว้ตามเก็บคนที่หายไปทั้งปี
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('expire_points')
    if (error) {
      // 42883 = ยังไม่ได้รัน supabase-migration-points-expiry.sql
      const hint = error.code === '42883' ? ' (ยังไม่ได้รัน supabase-migration-points-expiry.sql)' : ''
      throw new Error(error.message + hint)
    }
    return NextResponse.json({ updated: typeof data === 'number' ? data : 0 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 }
    )
  }
}
