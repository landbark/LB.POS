import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendStockAlerts } from '@/lib/lineNotify'

// ปุ่ม "ส่งทดสอบ" ในหน้าแจ้งเตือน — พนักงานที่ login แล้วเท่านั้น
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
