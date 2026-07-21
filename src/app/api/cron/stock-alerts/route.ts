import { NextResponse, type NextRequest } from 'next/server'
import { sendStockAlerts } from '@/lib/notify'

// ยิงโดย Vercel Cron ทุกเช้า (ดู vercel.json) — Vercel แนบ Authorization: Bearer CRON_SECRET ให้เอง
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendStockAlerts()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 }
    )
  }
}
