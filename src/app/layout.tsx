import type { Metadata, Viewport } from "next";
import { Sarabun } from "next/font/google";
import { Toaster } from "react-hot-toast";
import TopLoader from "@/components/TopLoader";
import ConfirmHost from "@/components/ConfirmHost";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

// Sarabun ตัวเดียวรับทั้งไทยและละติน — เลิกผสมสองตระกูล (เดิม Geist รับละติน + Noto Sans Thai รับไทย)
// 45% ของชื่อสินค้าในฐานข้อมูลมีไทยปนอังกฤษอยู่ในบรรทัดเดียวกัน คนละตระกูลแล้วความสูงตัวอักษรไม่เท่ากัน
//
// ผลพลอยได้สองอย่างจากการทิ้ง Geist:
// 1. ตัวเลข Sarabun กว้างเท่ากันหมด (550/1000 em) ยอดเงินเลยเรียงหลักเองโดยไม่ต้องใช้ tabular-nums
//    — Geist เลขกว้างไม่เท่ากัน (1 = 384 แต่ 0 = 663) ทศนิยมในตะกร้าจึงไม่เคยตรงหลัก
// 2. ตัวพิมพ์ใหญ่ Sarabun แคบกว่า Geist ~9% ชื่อสินค้าแบบ ALL CAPS ยาว ๆ (40% ของสินค้ายาวเกิน
//    40 ตัวอักษร) กินบรรทัดบนสลิป 72 มม. น้อยลง
//
// ข้อแลก: สระบนของ Sarabun อยู่สูงกว่า Noto Sans Thai มาก (952 vs 800 หน่วย) ตอนวรรณยุกต์ซ้อน
// หมึกพุ่ง 1.22 em เหนือเส้นฐาน (ตัวหนา 1.25) แปลว่า line-height ต่ำกว่า 1.60 สำหรับตัวปกติ
// หรือ 1.66 สำหรับตัวหนา จะตัดหัววรรณยุกต์ทิ้งถ้ากล่องนั้น overflow:hidden
// (ของ Noto Sans Thai เส้นแบ่งอยู่แค่ 1.41/1.46 จึงไม่เคยเจอปัญหานี้มาก่อน)
// วัดในเบราว์เซอร์จริงด้วย actualBoundingBoxAscent — ดู globals.css และ print/label
const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LANDBARK POS",
  description: "ระบบ POS สำหรับร้าน LANDBARK Pet Shop",
  // favicon บนแท็บ = โลโก้ร้านจากหน้าตั้งค่า (เปลี่ยนโลโก้แล้วตามเอง cache 1 ชม.)
  // ส่วนไอคอนบนโฮมสกรีน iOS ใช้ตัวที่มีพื้นหลังน้ำตาลเข้ม ไม่งั้นโลโก้โปร่งใสจะกลายเป็นขาว
  icons: { icon: "/api/favicon", apple: "/apple-icon.png" },
  appleWebApp: { capable: true, title: "LANDBARK", statusBarStyle: "black-translucent" },
};

// แถบสถานะ/พื้นหลังแอปตอนเปิดจากโฮมสกรีน — สีเดียวกับ --brand-bg ในเว็บ
export const viewport: Viewport = {
  themeColor: "#4A4338",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${sarabun.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <TopLoader />
        <Toaster position="top-center" />
        <ConfirmHost />
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
