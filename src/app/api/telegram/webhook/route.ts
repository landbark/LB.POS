import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/notify'

// Telegram เรียก endpoint นี้เมื่อมีข้อความเข้าบอท (public — proxy.ts ปล่อย /api/telegram)
// ป้องกันคนอื่นยิงมั่วด้วย secret token header ที่ตั้งตอน setWebhook
export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secret && request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let update: {
    message?: {
      text?: string
      chat?: { id: number; first_name?: string; username?: string; title?: string }
    }
  }
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msg = update.message
  const chat = msg?.chat
  const text = (msg?.text ?? '').trim()
  if (!chat || !text) return NextResponse.json({ ok: true })

  const chatId = String(chat.id)
  const name = chat.title ?? chat.first_name ?? chat.username ?? 'ไม่มีชื่อ'
  const admin = createAdminClient()

  try {
    if (text.startsWith('/start')) {
      await admin
        .from('telegram_recipients')
        .upsert({ chat_id: chatId, name }, { onConflict: 'chat_id' })
      await sendTelegramMessage(
        chatId,
        `✅ เชื่อมสำเร็จ — "${name}" จะได้รับแจ้งเตือนสต็อคของร้าน LANDBARK\nพิมพ์ /stop เพื่อยกเลิกรับแจ้งเตือน`
      )
    } else if (text.startsWith('/stop')) {
      await admin.from('telegram_recipients').delete().eq('chat_id', chatId)
      await sendTelegramMessage(chatId, '🔕 ยกเลิกรับแจ้งเตือนแล้ว — พิมพ์ /start เพื่อกลับมารับอีกครั้ง')
    } else {
      await sendTelegramMessage(chatId, 'พิมพ์ /start เพื่อรับแจ้งเตือนสต็อค หรือ /stop เพื่อยกเลิก')
    }
  } catch {
    // ไม่ throw กลับให้ Telegram (กัน retry ซ้ำ) — log ฝั่ง server ก็พอ
  }

  return NextResponse.json({ ok: true })
}
