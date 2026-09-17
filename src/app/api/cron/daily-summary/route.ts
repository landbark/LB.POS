import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildDailySalesMessage, gatherDailySales, notifyEvent } from '@/lib/notify'

// ยิงโดย Vercel Cron ทุกเย็น (ดู vercel.json) — สรุปยอดขายของวันให้เจ้าของ
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    const summary = await gatherDailySales(admin, today)
    const message = buildDailySalesMessage(summary)

    // ไม่มีบิลเลยทั้งวัน = ร้านปิด ไม่ต้องรบกวน
    if (!message) return NextResponse.json({ sent: false, reason: 'no_sales', date: today })

    await notifyEvent('daily_sales', message, { dedupeKey: `daily:${today}` })
    return NextResponse.json({ sent: true, date: today, total: summary.total, txCount: summary.txCount })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 }
    )
  }
}
