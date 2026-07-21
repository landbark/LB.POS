import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/notify'

// อนุมัติผู้ขอรับแจ้งเตือน — พนักงานที่ login แล้วเท่านั้น
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('telegram_recipients')
    .update({ approved: true })
    .eq('id', id)
    .select('chat_id, name')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data) {
    try {
      await sendTelegramMessage(
        data.chat_id,
        '🎉 คุณได้รับอนุมัติแล้ว — จะเริ่มได้รับแจ้งเตือนสต็อคของร้าน LANDBARK\nพิมพ์ /stop เพื่อยกเลิกได้ทุกเมื่อ'
      )
    } catch {
      // อนุมัติสำเร็จแล้วแม้ส่งข้อความแจ้งไม่ผ่าน — ไม่ถือเป็น error
    }
  }

  return NextResponse.json({ ok: true })
}
