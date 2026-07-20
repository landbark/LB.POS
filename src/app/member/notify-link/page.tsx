'use client'

// หน้าเชื่อม LINE รับแจ้งเตือนสต็อค — ต้องอยู่ใต้ /member เพราะ LIFF ยอมให้
// redirect กลับได้เฉพาะ URL ใต้ endpoint ของ LIFF เท่านั้น (staff เท่านั้น: proxy กัน path นี้อยู่แล้ว)

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

type Status = 'working' | 'done' | 'error'

export default function NotifyLinkPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('working')
  const [message, setMessage] = useState('กำลังเชื่อมบัญชี LINE...')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    async function link() {
      try {
        const liff = (await import('@line/liff')).default
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! })

        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href })
          return
        }

        const profile = await liff.getProfile()
        const supabase = createClient()
        const { error } = await supabase
          .from('line_notify_recipients')
          .upsert(
            { line_user_id: profile.userId, display_name: profile.displayName },
            { onConflict: 'line_user_id' }
          )
        if (error) throw new Error(error.message)

        setStatus('done')
        setMessage(`เชื่อม LINE "${profile.displayName}" เรียบร้อย`)
        setTimeout(() => router.replace('/admin/notifications'), 1500)
      } catch (err) {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'เชื่อม LINE ไม่สำเร็จ')
      }
    }

    link()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#FDF6EE' }}>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center max-w-sm">
        {status === 'working' && <Loader2 size={32} className="mx-auto mb-3 text-gray-400 animate-spin" />}
        {status === 'done' && <CheckCircle size={32} className="mx-auto mb-3 text-green-500" />}
        {status === 'error' && <XCircle size={32} className="mx-auto mb-3 text-red-500" />}
        <p className="text-sm text-gray-700">{message}</p>
        {status !== 'working' && (
          <button
            onClick={() => router.replace('/admin/notifications')}
            className="mt-4 text-sm font-medium px-4 py-2 rounded-lg text-white"
            style={{ background: '#C4865A' }}
          >
            กลับหน้าแจ้งเตือน
          </button>
        )}
      </div>
    </div>
  )
}
