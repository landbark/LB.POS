import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone = ก้อนเล็กที่สุดที่รันเองได้ ไม่ต้องมี node_modules ทั้งกอง — ใช้ตอน build เป็น Docker image
  // เปิดเฉพาะตอน build ใน Docker (ดู Dockerfile) ไม่งั้นปล่อยให้ Vercel build แบบเดิม
  // ระหว่างย้ายร้านยังขายของผ่าน Vercel อยู่ ห้ามให้ไฟล์นี้ไปเปลี่ยนพฤติกรรมฝั่งนั้น
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
};

export default nextConfig;

// เปิดให้ `next dev` มองเห็น binding ของ Cloudflare (R2 ที่ใช้เก็บผล revalidate)
// ต้องอยู่ท้ายไฟล์ หลัง export default ตามที่ adapter กำหนด
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
void initOpenNextCloudflareForDev()
