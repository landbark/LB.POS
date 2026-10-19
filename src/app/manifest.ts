import type { MetadataRoute } from 'next'

// สีพื้นหลังแอป = --brand-bg ในหน้าเว็บ (น้ำตาลเข้มอมเทาของหน้าล็อกอิน)
// ใช้ทั้งพื้นหลังไอคอนบนโฮมสกรีนและหน้าจอตอนเปิดแอป (splash) ไม่ให้ขาวโพลน
const BRAND_BG = '#4A4338'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LANDBARK POS',
    short_name: 'LANDBARK',
    description: 'ระบบ POS สำหรับร้าน LANDBARK Pet Shop',
    start_url: '/',
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
