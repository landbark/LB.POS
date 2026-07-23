'use client'

import Link from 'next/link'
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
} from 'lucide-react'

// vetHidden = หน้าที่หมอเข้าไม่ได้ (proxy.ts กันไว้แล้ว ตรงนี้แค่ไม่ให้เห็นเมนู)
const navItems = [
  { href: '/admin/dashboard', label: 'ภาพรวม', icon: LayoutDashboard, adminOnly: true },
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

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 flex flex-col" style={{ background: '#4A4338' }}>
      <div className="px-4 py-5 shrink-0" style={{ borderBottom: '1px solid #5C5144' }}>
        <h1 className="text-lg font-bold" style={{ color: '#F0E8DC' }}>LANDBARK</h1>
        <p className="text-xs mt-0.5" style={{ color: '#D4A87A' }}>{userName}</p>
      </div>

      {/* min-h-0 + overflow-y-auto: เมนูเยอะกว่าความสูงจอเมื่อไหร่ ให้ตัวเมนูเลื่อนเอง
          ไม่ใช่ดันปุ่มออกจากระบบตกขอบล่างไป */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-4 space-y-0.5 px-2">
        {navItems
          .filter((item) => role === 'admin' || !item.adminOnly)
          .filter((item) => role !== 'vet' || !item.vetHidden)
          .map(({ href, label, icon: Icon }) => {
          const active = (pathname.startsWith(href) && href !== '/pos') || pathname === href
          return (
            <Link
              key={href}
              href={href}
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
  )
}
