'use client'

import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startProgress, doneProgress } from './progress'

// ห่อ router ให้แสดงแถบโหลดด้านบนระหว่าง refresh/นำทาง
// ใช้แทน const router = useRouter() แล้วเรียก refresh()/push() ตามปกติ
export function useProgress() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const wasPending = useRef(false)

  useEffect(() => {
    if (isPending) {
      wasPending.current = true
      startProgress()
    } else if (wasPending.current) {
      wasPending.current = false
      doneProgress()
    }
  }, [isPending])

  return {
    // รีเฟรช server components ของหน้าปัจจุบัน พร้อมแถบโหลด
    refresh: () => startTransition(() => router.refresh()),
    push: (href: string) => startTransition(() => router.push(href)),
  }
}
