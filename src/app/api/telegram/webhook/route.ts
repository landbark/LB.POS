import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/notify'
import { redeemLinkToken, unlinkCustomerChat } from '@/lib/customer-notify'

// Telegram เรียก endpoint นี้เมื่อมีข้อความเข้าบอท (public — proxy.ts ปล่อย /api/telegram)
// ป้องกันคนอื่นยิงมั่วด้วย secret token header ที่ตั้งตอน setWebhook
export async function POST(request: NextRequest) {
  // fail closed — ถ้า env หาย ต้องปฏิเสธทุกคน ไม่ใช่เปิดรับทุกคน
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret || request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
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
    // เจ้าของสัตว์กดลิงก์จากหน้าสมาชิก → /start <token> ผูกอัตโนมัติ ไม่ต้องรออนุมัติ
    // (โทเคนออกให้เฉพาะคนที่ล็อกอินแล้ว จึงพิสูจน์ตัวตนได้ในตัว)
    const startToken = text.startsWith('/start ') ? text.slice(7).trim() : ''
    if (startToken) {
      const customerName = await redeemLinkToken(startToken, chatId)
      if (customerName) {
        await sendTelegramMessage(
          chatId,
          `✅ เชื่อมต่อสำเร็จแล้วค่ะ คุณ${customerName}\n\n`
            + 'จากนี้ LANDBARK จะแจ้งเตือนวันนัดของน้องให้ล่วงหน้า 1 วัน และเช้าวันนัดอีกครั้ง\n\n'
            + 'พิมพ์ /stop เพื่อยกเลิกได้ทุกเมื่อค่ะ'
        )
      } else {
        await sendTelegramMessage(
          chatId,
          '⚠️ ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว\n'
            + 'กรุณากลับไปที่หน้าสมาชิกของร้านแล้วกดปุ่มเชื่อมต่อใหม่อีกครั้งค่ะ'
        )
      }
      return NextResponse.json({ ok: true })
    }

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
      // chat เดียวกันอาจเป็นได้ทั้งลูกค้าและพนักงาน — ตัดทั้งสองทาง
      const wasCustomer = await unlinkCustomerChat(chatId)
      await admin.from('telegram_recipients').delete().eq('chat_id', chatId)
      await sendTelegramMessage(
        chatId,
        wasCustomer
          ? '🔕 ยกเลิกรับแจ้งเตือนวันนัดแล้วค่ะ\nกลับมารับใหม่ได้จากหน้าสมาชิกของร้านทุกเมื่อ'
          : '🔕 ยกเลิกรับแจ้งเตือนแล้ว — พิมพ์ /start เพื่อกลับมารับอีกครั้ง'
      )
    } else {
      // ลูกค้าที่ผูกไว้แล้วไม่ต้องเห็นคำแนะนำของพนักงาน
      const { data: linked } = await admin
        .from('customers')
        .select('id')
        .eq('telegram_chat_id', chatId)
        .maybeSingle()

      await sendTelegramMessage(
        chatId,
        linked
          ? 'บอทนี้ใช้แจ้งเตือนวันนัดของน้องค่ะ 🐾\nพิมพ์ /stop หากไม่ต้องการรับแจ้งเตือนแล้ว'
          : 'พิมพ์ /start เพื่อรับแจ้งเตือนสต็อค หรือ /stop เพื่อยกเลิก\n\n'
            + 'ถ้าคุณเป็นลูกค้าและต้องการรับแจ้งเตือนวันนัด กรุณากดปุ่มเชื่อมต่อจากหน้าสมาชิกของร้านค่ะ'
      )
    }
  } catch {
    // ไม่ throw กลับให้ Telegram (กัน retry ซ้ำ) — log ฝั่ง server ก็พอ
  }

  return NextResponse.json({ ok: true })
}
