import { NextResponse, type NextRequest } from 'next/server'
import { sendStockAlerts } from '@/lib/notify'
import { expireStaleOrders } from '@/lib/order-stock'
import { sendCustomerAppointmentReminders } from '@/lib/customer-notify'

// ยิงโดย Vercel Cron ทุกเช้า (ดู vercel.json) — Vercel แนบ Authorization: Bearer CRON_SECRET ให้เอง
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const expiredOrders = await expireStaleOrders()
    const result = await sendStockAlerts()
    // เตือนวันนัดให้เจ้าของสัตว์ด้วยในรอบเดียวกัน (ล่วงหน้า 1 วัน + เช้าวันนัด)
    const customerReminders = await sendCustomerAppointmentReminders()
    return NextResponse.json({ ...result, expiredOrders, customerReminders })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 }
    )
  }
}
