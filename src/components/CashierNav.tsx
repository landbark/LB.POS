'use client'

import Link from '@/components/ProgressLink'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Settings, LogOut } from 'lucide-react'

export default function CashierNav({ userName, isAdmin }: { userName: string; isAdmin: boolean }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="fixed top-0 left-0 right-0 h-14 flex items-center px-3 sm:px-4 gap-2 sm:gap-4 z-50" style={{ background: '#4A4338' }}>
      <span className="font-bold text-base sm:text-lg whitespace-nowrap" style={{ color: '#F0E8DC' }}>LANDBARK POS</span>
      <span className="hidden sm:inline text-sm" style={{ color: '#7A6A5A' }}>|</span>
      <span className="hidden sm:block text-sm truncate max-w-[14rem]" style={{ color: '#D4A87A' }}>{userName}</span>
      <div className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
        <Link
          href={isAdmin ? '/admin/dashboard' : '/admin/products'}
          className="flex items-center gap-1.5 text-sm px-2 sm:px-3 py-1.5 rounded transition-colors whitespace-nowrap"
          style={{ color: '#D4A87A' }}
        >
          <Settings size={15} />
          <span className="hidden sm:inline">จัดการร้าน</span>
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm px-2 sm:px-3 py-1.5 rounded transition-colors whitespace-nowrap"
          style={{ color: '#D4A87A' }}
        >
          <LogOut size={15} />
          <span className="hidden sm:inline">ออกจากระบบ</span>
        </button>
      </div>
    </header>
  )
}
