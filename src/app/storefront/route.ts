import { NextResponse, type NextRequest } from 'next/server'
import { isStaffHost, primaryCustomerHost } from '@/lib/staff-host'

// ทางกลับไปหน้าร้านของลูกค้า จากหน้าที่อยู่บนโดเมนพนักงาน (login, no-access, ตั้งค่าเว็บร้าน)
//
// ลิงก์พวกนั้นชี้ `/` ตรง ๆ ไม่ได้ เพราะ `/` บนโดเมนพนักงานเด้งกลับเข้าหน้างาน กลายเป็นวนที่เดิม
// แต่จะฝังโดเมนจริงลงไปในหน้าก็ไม่ได้อีก เพราะตอน dev บน localhost จะกระโดดขึ้นเว็บจริง
// เลยให้เซิร์ฟเวอร์ตัดสินตอนถูกกด โดยดูจาก host ที่คนกดอยู่
export function GET(request: NextRequest) {
  const host = request.headers.get('host')
  if (!isStaffHost(host)) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.redirect(new URL(`https://${primaryCustomerHost()}`))
}
