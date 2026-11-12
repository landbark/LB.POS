'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import toast from 'react-hot-toast'

const LOGIN_ERRORS: Record<string, string> = {
  'not-allowed': 'อีเมลนี้ยังไม่ได้รับอนุญาตให้เข้าใช้งาน — แจ้งเจ้าของร้านเพิ่มอีเมลของคุณที่ ตั้งค่า → พนักงาน ก่อน',
  auth: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
}

/** อ่าน ?error= จาก URL — แยกเป็นคอมโพเนนต์เพราะ useSearchParams ต้องอยู่ใน Suspense */
function LoginError() {
  const error = useSearchParams().get('error')
  if (!error) return null

  return (
    <div className="rounded-xl px-4 py-3 mb-5 text-sm" style={{ background: '#5B3A34', color: '#F0E8DC' }}>
      {LOGIN_ERRORS[error] ?? LOGIN_ERRORS.auth}
    </div>
  )
}

export default function LoginPage() {
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

          <Suspense fallback={null}>
            <LoginError />
          </Suspense>

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

          {/* เข้าได้เฉพาะอีเมลที่เจ้าของร้านเพิ่มไว้แล้ว (staff_emails) */}
          <p className="text-xs text-center mb-5 -mt-3" style={{ color: '#D4A87A' }}>
            เข้าได้ด้วยบัญชี Google ของอีเมลที่เจ้าของร้านเพิ่มไว้เท่านั้น
            — พนักงานใหม่แจ้งเจ้าของร้านเพิ่มอีเมลก่อน
          </p>

        </div>

        {/* ทางกลับหน้าเว็บร้าน (หน้าสาธารณะ) — ลูกค้าที่หลงเข้ามาหน้านี้จะได้ไม่ตัน */}
        <p className="hide-in-app text-center mt-5">
          <a href="/storefront" className="text-sm hover:underline" style={{ color: '#D4A87A' }}>
            ← กลับหน้าเว็บร้าน
          </a>
        </p>
      </div>
    </div>
  )
}
