import { NextResponse } from 'next/server'
import { getStaff } from '@/lib/require-staff'
import { sendStockAlerts } from '@/lib/notify'

// ปุ่ม "ส่งทดสอบ" ในหน้าแจ้งเตือน — พนักงานที่ login แล้วเท่านั้น
export async function POST() {
  // ต้องเป็นพนักงานที่อนุมัติแล้ว — แค่มี session ยังไม่พอ (ดู lib/require-staff)
  if (!(await getStaff())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const result = await sendStockAlerts({ ignoreDisabled: true, sendWhenEmpty: true })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 }
    )
  }
}
