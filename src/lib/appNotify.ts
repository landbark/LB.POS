import type { createAdminClient } from '@/lib/supabase/admin'
import type { AppNotificationKind } from '@/lib/types'

/**
 * แจ้งเตือนในระบบ — กล่องเดียวที่ทุกเครื่องที่ล็อกอินเห็นเหมือนกัน (ดูกระดิ่งที่ NotificationBell)
 *
 * ทำไมต้องมีทั้ง Telegram และตัวนี้: Telegram เข้าเครื่องเจ้าของ ส่วนคนที่ยืนอยู่หน้าร้าน
 * ไม่ได้ติดตั้งไว้ และไม่ควรต้องเดินเข้าเมนูจัดการร้านเพื่อดูว่ามีออเดอร์ออนไลน์เข้ามาไหม
 *
 * เขียนได้จากฝั่ง server เท่านั้น (service role) — RLS ให้ authenticated อ่านอย่างเดียว
 * ไม่งั้นใครยิง API ตรงก็ยัดข้อความปลอมขึ้นกระดิ่งทุกเครื่องได้
 */
export async function pushAppNotification(
  admin: ReturnType<typeof createAdminClient>,
  n: { kind: AppNotificationKind; title: string; body?: string | null; link?: string | null },
): Promise<void> {
  try {
    await admin.from('app_notifications').insert({
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
    })
  } catch {
    // แจ้งเตือนเป็นงานเสริม — ล้มเหลวต้องไม่ทำให้งานหลัก (ขาย/ยกเลิก/รับออเดอร์) พัง
  }
}
