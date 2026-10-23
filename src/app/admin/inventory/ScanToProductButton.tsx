'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanLine, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/supabase/fetch-all'
import BarcodeScanner, { type ScanFeedback } from '@/components/BarcodeScanner'

interface Entry {
  productId: string
  name: string
  /** ชื่อหน่วยเมื่อบาร์โค้ดนั้นเป็นของแพ็ก (ลัง/กล่อง) */
  packName?: string
}

/**
 * ยิงบาร์โค้ดของที่ถืออยู่แล้วกระโดดไปหน้าสินค้าตัวนั้นเลย — ไว้เช็คว่าระบบว่ามีกี่ชิ้น
 * ล็อตไหนหมดอายุเมื่อไหร่ และปรับยอดได้ในหน้าเดียวกัน
 *
 * โหลดตารางบาร์โค้ดทั้งร้านตอนเปิดกล้อง (แค่ id กับบาร์โค้ด ไม่ถึงร้อย KB) เพื่อให้
 * ตอบได้ทันทีใต้กล้อง — ยิงแล้วต้องรอ query ทีละครั้งจะหน่วงจนยิงรัวไม่ได้
 */
export default function ScanToProductButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [index, setIndex] = useState<Map<string, Entry> | null>(null)

  async function openScanner() {
    if (index) {
      setOpen(true)
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const [products, units] = await Promise.all([
        fetchAll<{ id: string; name: string; barcode: string | null }>((from, to) =>
          supabase.from('products').select('id, name, barcode').eq('active', true).order('id').range(from, to)
        ),
        fetchAll<{ product_id: string; unit_name: string; barcode: string | null }>((from, to) =>
          supabase
            .from('product_units')
            .select('product_id, unit_name, barcode')
            .eq('active', true)
            .not('barcode', 'is', null)
            .order('id')
            .range(from, to)
        ),
      ])

      const map = new Map<string, Entry>()
      const nameById = new Map(products.map((p) => [p.id, p.name]))
      for (const p of products) {
        if (p.barcode?.trim()) map.set(p.barcode.trim(), { productId: p.id, name: p.name })
      }
      // บาร์โค้ดข้างลังคนละตัวกับข้างซอง — ยิงลังก็ต้องไปถึงสินค้าตัวเดียวกัน
      for (const u of units) {
        const code = u.barcode?.trim()
        if (!code || map.has(code)) continue
        map.set(code, {
          productId: u.product_id,
          name: nameById.get(u.product_id) ?? '—',
          packName: u.unit_name,
        })
      }

      setIndex(map)
      setOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'โหลดรายการบาร์โค้ดไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  function handleDetect(code: string): ScanFeedback {
    const hit = index?.get(code.trim())
    if (!hit) return { ok: false, message: `ไม่พบสินค้าที่ใช้บาร์โค้ด ${code}` }

    setOpen(false)
    router.push(`/admin/products/${hit.productId}`)
    return { ok: true, message: hit.packName ? `${hit.name} (${hit.packName})` : hit.name }
  }

  return (
    <>
      <button
        onClick={openScanner}
        disabled={loading}
        className="flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg shrink-0"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <ScanLine size={15} />} ยิงบาร์โค้ด
      </button>
      {open && <BarcodeScanner onDetect={handleDetect} onClose={() => setOpen(false)} />}
    </>
  )
}
