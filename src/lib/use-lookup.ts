'use client'

import { useEffect, useState } from 'react'

const DEBOUNCE_MS = 250

/**
 * ค้นหาลูกค้า/สัตว์จากฝั่ง server สำหรับช่องเลือกแบบพิมพ์ค้นหา
 *
 * ใช้แทนการโหลดทั้งตารางมา filter ในเบราว์เซอร์ — ข้อมูลโตเท่าไหร่ก็ยังค้นเจอ
 * และไม่ต้องส่งรายชื่อลูกค้าทั้งร้านไปกับทุกครั้งที่เปิดหน้า
 */
export function useLookup<T>(type: 'pets' | 'customers', query: string, enabled = true) {
  // เก็บคำค้นไว้คู่กับผลลัพธ์ของมัน — "กำลังโหลด" คือผลที่ถืออยู่ยังไม่ใช่ของคำค้นปัจจุบัน
  // คิดเอาแบบนี้แทนการ setState ตรงๆ ในบอดี้ของ effect ซึ่งทำให้ render ซ้อนกันเป็นทอดๆ
  const [done, setDone] = useState<{ q: string; results: T[] }>({ q: '', results: [] })

  const q = query.trim()
  const active = enabled && q.length > 0

  useEffect(() => {
    if (!active) return

    let cancelled = false
    const controller = new AbortController()

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/lookup?type=${type}&q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        )
        const data = await res.json()
        if (!cancelled) setDone({ q, results: data.results ?? [] })
      } catch {
        // ยกเลิกเพราะพิมพ์ต่อ หรือเน็ตสะดุด — ปล่อยผลเดิมไว้ แต่เลิกขึ้นว่ากำลังโหลด
        if (!cancelled) setDone((prev) => ({ q, results: prev.results }))
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [type, q, active])

  return {
    // ช่องว่างหรือปิดอยู่ = ไม่มีผลลัพธ์ ไม่ต้องล้าง state ทิ้ง
    results: active ? done.results : [],
    loading: active && done.q !== q,
  }
}
