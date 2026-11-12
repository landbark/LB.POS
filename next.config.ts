import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone = ก้อนเล็กที่สุดที่รันเองได้ ไม่ต้องมี node_modules ทั้งกอง — ใช้ตอน build เป็น Docker image
  // เปิดเฉพาะตอน build ใน Docker (ดู Dockerfile) ไม่งั้นปล่อยให้ Vercel build แบบเดิม
  // ระหว่างย้ายร้านยังขายของผ่าน Vercel อยู่ ห้ามให้ไฟล์นี้ไปเปลี่ยนพฤติกรรมฝั่งนั้น
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // ห้ามเว็บอื่นฝังเว็บเราใน iframe — กันหน้าขาย/หลังร้านถูกเอาไปครอบ
          // แล้วหลอกให้พนักงานกดปุ่มในนั้น (clickjacking)
          //
          // SAMEORIGIN ไม่ใช่ DENY เพราะหน้าขายฝัง /print/receipt?embed=1 ใน iframe
          // ของตัวเองเพื่อสั่งพิมพ์ (ดู lib/use-receipt-print.ts) — DENY จะพิมพ์ใบเสร็จไม่ได้
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          // เบราว์เซอร์ห้ามเดาชนิดไฟล์เอง — ไฟล์ที่อัปโหลดมาจะไม่ถูกรันเป็น HTML
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // ลิงก์ออกนอกเว็บไม่ต้องติด path ไปด้วย (เลขที่บิล/id ลูกค้าอยู่ใน url)
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // ไม่มีหน้าไหนใช้กล้อง/ไมค์/ตำแหน่ง ยกเว้นสแกนบาร์โค้ด (ขอ camera ไว้ให้โดเมนตัวเอง)
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          // บังคับ https ทั้งโดเมนรวมซับโดเมน (Cloudflare ออกใบให้ทุกตัวอยู่แล้ว)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
};

export default nextConfig;

// เปิดให้ `next dev` มองเห็น binding ของ Cloudflare (R2 ที่ใช้เก็บผล revalidate)
// ต้องอยู่ท้ายไฟล์ หลัง export default ตามที่ adapter กำหนด
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
void initOpenNextCloudflareForDev()
