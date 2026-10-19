'use client'

import { useEffect } from 'react'

// ลงทะเบียน service worker เปล่าๆ ที่ public/sw.js — Chrome ถึงจะขึ้นปุ่ม "ติดตั้งแอป" บนมือถือ
export default function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ติดตั้งไม่ได้ก็ใช้เว็บตามปกติ ไม่ต้องกวนผู้ใช้ */
    })
  }, [])
  return null
}
