import { headers } from 'next/headers'
import type { MetadataRoute } from 'next'
import { isStaffHost } from '@/lib/staff-host'

// สีพื้นหลังแอป = --brand-bg ในหน้าเว็บ (น้ำตาลเข้มอมเทาของหน้าล็อกอิน)
// ใช้ทั้งพื้นหลังไอคอนบนโฮมสกรีนและหน้าจอตอนเปิดแอป (splash) ไม่ให้ขาวโพลน
const BRAND_BG = '#4A4338'

// worker ตัวเดียวเสิร์ฟสองโดเมน manifest จึงต้องรู้ว่ากำลังตอบให้โดเมนไหน
export const dynamic = 'force-dynamic'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const staff = isStaffHost((await headers()).get('host'))

  // ⚠️ start_url ต้องตอบ 200 ให้คนที่ไม่มีคุกกี้ ห้ามเป็น redirect
  //
  // ตอนกดติดตั้งบน Android, Chrome ไม่ได้สร้างแอปเอง แต่ส่ง manifest ไปให้เซิร์ฟเวอร์ของ
  // Google ประกอบเป็นแอปจริง (WebAPK) ซึ่งเข้ามาดึง start_url เองโดยไม่มีเซสชันของเรา
  // ถ้าเจอ redirect การประกอบจะล้ม แล้ว Chrome จะถอยไปติดตั้งเป็น "ทางลัด" แทนเงียบ ๆ
  // อาการคือได้ไอคอนมาเหมือนกัน แต่เปิดแล้วมีแถบ URL ของ Chrome คาอยู่ข้างบน ไม่เต็มจอ
  //
  // โดเมนพนักงานจึงชี้ /login ซึ่งตอบ 200 เสมอ แล้วปล่อยให้ proxy พาไปหน้างานตาม role
  // ถ้ามีเซสชันอยู่แล้ว — ผลที่ผู้ใช้เห็นเหมือนเดิมทุกประการ
  const startUrl = staff ? '/login' : '/'

  return {
    name: staff ? 'LANDBARK POS' : 'LANDBARK',
    short_name: 'LANDBARK',
    description: staff
      ? 'ระบบ POS สำหรับร้าน LANDBARK Pet Shop'
      : 'ร้านเพทชอปและคลินิกรักษาสัตว์ LANDBARK',
    start_url: startUrl,
    // ประกาศ scope เองแทนที่จะให้เดาจาก start_url — ไม่งั้นพอ start_url เป็น /login
    // scope จะเหลือแค่หน้านั้น แล้วทุกหน้าที่เหลือกลายเป็น "นอกขอบเขต" เปิดแล้วมีแถบ URL โผล่
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: BRAND_BG,
    theme_color: BRAND_BG,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android ครอปไอคอนเป็นวงกลม/สี่เหลี่ยมมน ต้องมีตัว maskable ที่เผื่อขอบไว้
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
