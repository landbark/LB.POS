'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import { LogOut } from 'lucide-react'

export default function NoAccessPage() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#4A4338' }}>
      <div className="w-full max-w-sm text-center">
        <div className="w-28 h-28 relative mx-auto mb-4">
          <Image src="/logo.png" alt="LANDBARK" fill className="object-contain" priority />
        </div>
        <div className="rounded-2xl shadow-xl px-8 py-7" style={{ background: '#5C5144' }}>
          <h1 className="text-lg font-bold mb-2" style={{ color: '#F0E8DC' }}>
            บัญชีนี้ยังไม่ได้รับอนุญาต
          </h1>
          <p className="text-sm mb-6" style={{ color: '#D4A87A' }}>
            อีเมลของคุณยังไม่อยู่ในรายชื่อพนักงาน
            กรุณาติดต่อเจ้าของร้านให้เพิ่มอีเมลนี้ในหน้าตั้งค่า
          </p>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 font-semibold py-2.5 rounded-xl text-sm transition-colors"
            style={{ background: '#C4865A', color: '#FDF6EE' }}
          >
            <LogOut size={16} />
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  )
}
