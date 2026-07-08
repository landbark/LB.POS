'use client'

import Link from 'next/link'
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
    <header className="fixed top-0 left-0 right-0 h-14 flex items-center px-4 gap-4 z-50" style={{ background: '#4A4338' }}>
      <span className="font-bold text-lg" style={{ color: '#F0E8DC' }}>LANDBARK POS</span>
      <span className="text-sm" style={{ color: '#7A6A5A' }}>|</span>
      <span className="text-sm" style={{ color: '#D4A87A' }}>{userName}</span>
      <div className="ml-auto flex items-center gap-2">
        {isAdmin && (
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-colors"
            style={{ color: '#D4A87A' }}
          >
            <Settings size={15} />
            Admin
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-colors"
          style={{ color: '#D4A87A' }}
        >
          <LogOut size={15} />
          ออกจากระบบ
        </button>
      </div>
    </header>
  )
}
