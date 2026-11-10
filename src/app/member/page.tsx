import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { isStaffHost, primaryCustomerHost } from '@/lib/staff-host'

export const dynamic = 'force-dynamic'

/**
 * หน้าเช็คแต้มตัวเก่า (LIFF) — ย้ายไปหน้าบัญชีลูกค้าบนเว็บร้านแล้ว
 *
 * /account ทำได้ทุกอย่างที่หน้านี้เคยทำ (ดูแต้ม ประวัติการซื้อ ผูกเบอร์สมาชิก)
 * บวกสั่งซื้อออนไลน์ สมุดที่อยู่ และแจ้งเตือน Telegram และใช้ LINE Login ปกติ
 * ไม่ใช่ LIFF ที่ต้องพึ่ง scope openid ของ channel (ซึ่งเป็นต้นเหตุที่หน้านี้เปิดไม่ขึ้น)
 *
 * ลิงก์เก่าในริชเมนู LINE OA ยังใช้ได้ เพราะเด้งมาที่นี่แล้วส่งต่อให้เอง
 */
export default async function MemberPage() {
  const host = (await headers()).get('host')
  // เปิดจากโดเมนพนักงาน (endpoint ของ LIFF เดิมคือ pos.landbark.app/member)
  // ต้องข้ามไปโดเมนลูกค้า ไม่งั้นเซสชันสมาชิกคนละโดเมนกับที่ล็อกอินไว้
  if (isStaffHost(host)) redirect(`https://${primaryCustomerHost()}/account`)
  redirect('/account')
}
