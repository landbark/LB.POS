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
      const { data: existing } = await admin
        .from('telegram_recipients')
        .select('approved')
        .eq('chat_id', chatId)
        .maybeSingle()

      if (existing?.approved) {
        await admin.from('telegram_recipients').update({ name }).eq('chat_id', chatId)
        await sendTelegramMessage(
          chatId,
          `✅ "${name}" รับแจ้งเตือนสต็อคของร้าน LANDBARK อยู่แล้ว\nพิมพ์ /stop เพื่อยกเลิก`
        )
      } else if (existing) {
        await admin.from('telegram_recipients').update({ name }).eq('chat_id', chatId)
        await sendTelegramMessage(chatId, '⏳ คำขอของคุณส่งแล้ว กำลังรอแอดมินอนุมัติ')
      } else {
        // สมัครใหม่ = pending เสมอ รอแอดมินกดอนุมัติในหน้าเว็บก่อน (approved default false)
        await admin.from('telegram_recipients').insert({ chat_id: chatId, name })
        await sendTelegramMessage(
          chatId,
          '⏳ ส่งคำขอรับแจ้งเตือนแล้ว — รอแอดมินอนุมัติ ระบบจะแจ้งให้ทราบเมื่อได้รับอนุมัติ'
        )
      }
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
