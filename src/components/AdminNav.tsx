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
} from 'lucide-react'

const navItems = [
  { href: '/admin/dashboard', label: 'ภาพรวม', icon: LayoutDashboard, adminOnly: true },
  { href: '/pos', label: 'หน้าขาย', icon: ShoppingCart, adminOnly: false },
  { href: '/admin/products', label: 'สินค้า', icon: Package, adminOnly: false },
  { href: '/admin/inventory', label: 'สต็อค', icon: Layers, adminOnly: false },
  { href: '/admin/receiving', label: 'นำเข้าสินค้า', icon: PackagePlus, adminOnly: false },
  { href: '/admin/suppliers', label: 'ซัพพลายเออร์', icon: Truck, adminOnly: false },
  { href: '/admin/documents', label: 'เอกสาร', icon: FileText, adminOnly: false },
  { href: '/admin/reports', label: 'รายงาน', icon: BarChart2, adminOnly: true },
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
      <div className="px-4 py-5" style={{ borderBottom: '1px solid #5C5144' }}>
        <h1 className="text-lg font-bold" style={{ color: '#F0E8DC' }}>LANDBARK</h1>
        <p className="text-xs mt-0.5" style={{ color: '#D4A87A' }}>{userName}</p>
      </div>

      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {navItems.filter((item) => role === 'admin' || !item.adminOnly).map(({ href, label, icon: Icon }) => {
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

      <div className="p-2" style={{ borderTop: '1px solid #5C5144' }}>
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
