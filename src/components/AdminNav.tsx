'use client'

import { useState } from 'react'
import Link from '@/components/ProgressLink'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  Layers,
  Truck,
  BarChart2,
  Settings,
  LogOut,
  ShoppingCart,
  FileText,
  Users,
  Tag,
  Wallet,
  CalendarDays,
  Bell,
  PawPrint,
  Stethoscope,
  CalendarClock,
  Syringe,
  Menu,
  X,
  ShoppingBag,
  Megaphone,
  Globe,
} from 'lucide-react'

// vetHidden = หน้าที่หมอเข้าไม่ได้ (proxy.ts กันไว้แล้ว ตรงนี้แค่ไม่ให้เห็นเมนู)
const navItems = [
  { href: '/admin/dashboard', label: 'ภาพรวม', icon: LayoutDashboard, cashierHidden: true },
  { href: '/pos', label: 'หน้าขาย', icon: ShoppingCart, adminOnly: false, vetHidden: true },
  { href: '/admin/visits', label: 'ตรวจรักษา', icon: Stethoscope, adminOnly: false },
  { href: '/admin/appointments', label: 'นัดหมาย', icon: CalendarClock, adminOnly: false },
  { href: '/admin/vaccines', label: 'วัคซีน', icon: Syringe, adminOnly: false },
  { href: '/admin/pets', label: 'สัตว์เลี้ยง', icon: PawPrint, adminOnly: false },
  { href: '/admin/products', label: 'สินค้า', icon: Package, adminOnly: false },
  { href: '/admin/inventory', label: 'สต็อค', icon: Layers, adminOnly: false },
  { href: '/admin/receiving', label: 'นำเข้าสินค้า', icon: PackagePlus, adminOnly: false, vetHidden: true },
  { href: '/admin/suppliers', label: 'ซัพพลายเออร์', icon: Truck, adminOnly: false, vetHidden: true },
  { href: '/admin/customers', label: 'ลูกค้า / เจ้าของสัตว์', icon: Users, adminOnly: false },
  { href: '/admin/orders', label: 'ออเดอร์ออนไลน์', icon: ShoppingBag, adminOnly: false, vetHidden: true },
  { href: '/admin/announcements', label: 'ประกาศข่าว', icon: Megaphone, adminOnly: true },
  { href: '/admin/website', label: 'เว็บร้าน / ค่าส่ง', icon: Globe, adminOnly: true },
  { href: '/admin/promotions', label: 'โปรโมชั่น', icon: Tag, adminOnly: true },
  { href: '/admin/documents', label: 'เอกสาร', icon: FileText, adminOnly: false, vetHidden: true },
  { href: '/admin/shift', label: 'ปิดกะ/เงินสด', icon: Wallet, adminOnly: false, vetHidden: true },
  { href: '/admin/daily', label: 'สรุปรายวัน', icon: CalendarDays, adminOnly: false, vetHidden: true },
  { href: '/admin/reports', label: 'รายงาน', icon: BarChart2, adminOnly: true },
  { href: '/admin/notifications', label: 'แจ้งเตือน Telegram', icon: Bell, adminOnly: false },
  { href: '/admin/settings', label: 'ตั้งค่า', icon: Settings, adminOnly: true },
]

export default function AdminNav({ userName, role }: { userName: string; role: string }) {
  const pathname = usePathname()
  const router = useRouter()
  // มือถือ: เมนูซ่อนไว้เป็นลิ้นชัก เปิดด้วยปุ่มบนแถบด้านบน (จอ md ขึ้นไปโชว์ค้างเหมือนเดิม)
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* แถบบนสำหรับมือถือ */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 h-14 z-30 flex items-center gap-3 px-3"
        style={{ background: '#4A4338', borderBottom: '1px solid #5C5144' }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="เปิดเมนู"
          className="p-2 rounded-lg"
          style={{ color: '#F0E8DC' }}
        >
          <Menu size={22} />
        </button>
        <span className="font-bold truncate" style={{ color: '#F0E8DC' }}>LANDBARK</span>
        <span className="text-xs truncate ml-auto" style={{ color: '#D4A87A' }}>{userName}</span>
      </div>

      {/* ฉากหลังตอนเปิดเมนูบนมือถือ — แตะแล้วปิด */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
      )}

    <aside
      // ซ่อนเฉพาะจอเล็ก (max-md) — จอ md ขึ้นไปไม่ใส่ translate เลย จะได้ไม่ต้องแข่งลำดับ CSS กัน
      className={`fixed left-0 top-0 h-screen w-56 flex flex-col z-50 transition-transform duration-200 ${open ? 'translate-x-0' : 'max-md:-translate-x-full'}`}
      style={{ background: '#4A4338' }}
    >
      <div className="px-4 py-5 shrink-0 flex items-start" style={{ borderBottom: '1px solid #5C5144' }}>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold" style={{ color: '#F0E8DC' }}>LANDBARK</h1>
          <p className="text-xs mt-0.5 truncate" style={{ color: '#D4A87A' }}>{userName}</p>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="ปิดเมนู"
          className="md:hidden p-1 -mr-1"
          style={{ color: '#D4A87A' }}
        >
          <X size={20} />
        </button>
      </div>

      {/* min-h-0 + overflow-y-auto: เมนูเยอะกว่าความสูงจอเมื่อไหร่ ให้ตัวเมนูเลื่อนเอง
          ไม่ใช่ดันปุ่มออกจากระบบตกขอบล่างไป */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-4 space-y-0.5 px-2">
        {navItems
          .filter((item) => role === 'admin' || !item.adminOnly)
          .filter((item) => role !== 'vet' || !item.vetHidden)
          .filter((item) => role !== 'cashier' || !item.cashierHidden)
          .map(({ href, label, icon: Icon }) => {
          const active = (pathname.startsWith(href) && href !== '/pos') || pathname === href
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
              style={active
                ? { background: '#C4865A', color: '#FDF6EE' }
                : { color: '#D4A87A' }
              }
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = '#5C5144'; e.currentTarget.style.color = '#F0E8DC' } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#D4A87A' } }}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-2 shrink-0" style={{ borderTop: '1px solid #5C5144' }}>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors"
          style={{ color: '#D4A87A' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#5C5144'; e.currentTarget.style.color = '#F0E8DC' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#D4A87A' }}
        >
          <LogOut size={18} />
          ออกจากระบบ
        </button>
      </div>
    </aside>
    </>
  )
}
