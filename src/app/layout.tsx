import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "react-hot-toast";
import TopLoader from "@/components/TopLoader";
import ConfirmHost from "@/components/ConfirmHost";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
    <html lang="th" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <TopLoader />
        <Toaster position="top-center" />
        <ConfirmHost />
        {children}
      </body>
    </html>
  );
}
