'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { startProgress } from '@/lib/progress'

// Link ที่จุดแถบโหลดด้านบนทันทีที่คลิก — ให้รู้สึกว่าตอบสนองเลย ไม่ค้าง
export default function ProgressLink(props: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onNavigate={(e) => {
        startProgress()
        props.onNavigate?.(e)
      }}
    />
  )
}
