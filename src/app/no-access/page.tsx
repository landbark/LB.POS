'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import { LogOut, Clock } from 'lucide-react'
import Link from 'next/link'

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
          <Clock size={28} className="mx-auto mb-2" style={{ color: '#D4A87A' }} />
          <h1 className="text-lg font-bold mb-2" style={{ color: '#F0E8DC' }}>
            ส่งคำขอเข้าใช้งานแล้ว
          </h1>
          <p className="text-sm mb-6" style={{ color: '#D4A87A' }}>
            บัญชีของคุณเข้ามาอยู่ในรายการรออนุมัติของเจ้าของร้านแล้ว
            แจ้งเจ้าของร้านให้กดอนุมัติในหน้าภาพรวม แล้วเข้าสู่ระบบอีกครั้งได้เลย
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

        <p className="mt-5">
          <Link href="/" className="text-sm hover:underline" style={{ color: '#D4A87A' }}>
            ← กลับหน้าเว็บร้าน
          </Link>
        </p>
      </div>
    </div>
  )
}
