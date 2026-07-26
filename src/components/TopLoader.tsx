'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// แถบโหลดบางๆ ด้านบนสุดของจอ — ให้ผู้ใช้เห็นว่าระบบกำลังทำงาน ไม่ค้าง
// เริ่มเมื่อได้รับ event 'lb:progress-start' (นับซ้อนกันได้), จบเมื่อ event 'lb:progress-done'
// และจบอัตโนมัติเมื่อเปลี่ยนหน้า (pathname เปลี่ยน = โหลดหน้าใหม่เสร็จ)
export default function TopLoader() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0) // 0 = ซ่อน
  const countRef = useRef(0)
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstRender = useRef(true)

  function clearTrickle() {
    if (trickleRef.current) { clearInterval(trickleRef.current); trickleRef.current = null }
  }

  function begin() {
    countRef.current += 1
    if (countRef.current > 1) return
    if (hideRef.current) { clearTimeout(hideRef.current); hideRef.current = null }
    setProgress(8)
    clearTrickle()
    // ไต่ขึ้นเรื่อยๆ แต่ไม่ถึง 90% จนกว่าจะจบจริง
    trickleRef.current = setInterval(() => {
      setProgress((p) => (p > 0 && p < 90 ? p + (90 - p) * 0.12 : p))
    }, 220)
    // กันค้าง: ถ้า 15 วิยังไม่จบ ให้ปิดเอง
    if (safetyRef.current) clearTimeout(safetyRef.current)
    safetyRef.current = setTimeout(() => finishAll(), 15000)
  }

  function end() {
    countRef.current = Math.max(0, countRef.current - 1)
    if (countRef.current === 0) finishAll()
  }

  function finishAll() {
    countRef.current = 0
    clearTrickle()
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
    setProgress((p) => (p === 0 ? 0 : 100))
    if (hideRef.current) clearTimeout(hideRef.current)
    hideRef.current = setTimeout(() => setProgress(0), 300)
  }

  useEffect(() => {
    window.addEventListener('lb:progress-start', begin)
    window.addEventListener('lb:progress-done', end)
    return () => {
      window.removeEventListener('lb:progress-start', begin)
      window.removeEventListener('lb:progress-done', end)
      clearTrickle()
      if (hideRef.current) clearTimeout(hideRef.current)
      if (safetyRef.current) clearTimeout(safetyRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // เปลี่ยนหน้าแล้ว = โหลดเสร็จ
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    finishAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  if (progress === 0) return null

  return (
    <div
      aria-hidden
      style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 9999, pointerEvents: 'none' }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: '#C4865A',
          boxShadow: '0 0 8px rgba(196,134,90,0.7)',
          transition: 'width 200ms ease',
        }}
      />
    </div>
  )
}
