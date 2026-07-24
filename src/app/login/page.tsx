'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { homePath } from '@/lib/home-path'
import Image from 'next/image'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      toast.error('เข้าสู่ระบบด้วย Google ไม่สำเร็จ')
      setGoogleLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
      setLoading(false)
      return
    }
    // หน้าแรกตาม role — admin/หมอ ไป dashboard, แคชเชียร์ไปหน้าขาย
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()
    router.push(homePath(profile?.role))
    router.refresh()
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#4A4338' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-36 h-36 relative mb-2">
            <Image
              src="/logo.png"
              alt="LANDBARK"
              fill
              className="object-contain"
              priority
            />
          </div>
          <p className="text-sm font-medium" style={{ color: '#D4A87A' }}>
            LANDBARK POS
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl shadow-xl px-8 py-7" style={{ background: '#5C5144' }}>

          {/* Google Login */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50 mb-5"
            style={{ background: '#4A4338', color: '#F0E8DC' }}
          >
            {/* Google icon SVG */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            {googleLoading ? 'กำลังเชื่อมต่อ...' : 'เข้าสู่ระบบด้วย Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px" style={{ background: '#7A6A5A' }} />
            <span className="text-xs" style={{ color: '#D4A87A' }}>หรือใช้อีเมล</span>
            <div className="flex-1 h-px" style={{ background: '#7A6A5A' }} />
          </div>

          {/* Email / Password */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#F0E8DC' }}>
                อีเมล
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ background: '#4A4338', border: '1px solid #7A6A5A', color: '#F0E8DC', '--tw-ring-color': '#C4865A' } as React.CSSProperties}
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#F0E8DC' }}>
                รหัสผ่าน
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ background: '#4A4338', border: '1px solid #7A6A5A', color: '#F0E8DC', '--tw-ring-color': '#C4865A' } as React.CSSProperties}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 mt-1"
              style={{ background: '#C4865A', color: '#FDF6EE' }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#D4A87A' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#C4865A' }}
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
