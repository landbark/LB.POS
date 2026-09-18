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
  const [results, setResults] = useState<T[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!enabled || q.length === 0) {
      setResults([])
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/lookup?type=${type}&q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        )
        const data = await res.json()
        if (!cancelled) setResults(data.results ?? [])
      } catch {
        // ยกเลิกเพราะพิมพ์ต่อ หรือเน็ตสะดุด — ปล่อยผลเดิมไว้
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [type, query, enabled])

  return { results, loading }
}
