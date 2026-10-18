'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'

/**
 * ติ๊กงดจำหน่ายได้จากตารางสินค้าเลย ไม่ต้องเข้าไปแก้ทีละตัว
 *
 * งดจำหน่าย = `active = false` ซึ่งทุกช่องทางขายกรองออกให้อยู่แล้ว (หน้าขาย POS, เว็บร้านค้า,
 * หน้าคลินิก, โปรโมชั่น, หน้านำเข้าสินค้า, เตือนสต็อค) แต่ข้อมูลเก่ายังอยู่ครบ —
 * บิลเดิม สต็อคเดิม และรายงานย้อนหลังยังเห็นสินค้าตัวนี้เหมือนเดิม
 */
export default function StopSellingToggle({ product }: { product: Product }) {
  const router = useRouter()
  const [stopped, setStopped] = useState(!product.active)
  const [busy, setBusy] = useState(false)

  async function toggle(next: boolean) {
    setBusy(true)
    setStopped(next)
    const supabase = createClient()
    const { error } = await supabase
      .from('products')
      .update({ active: !next })
      .eq('id', product.id)
    setBusy(false)

    if (error) {
      setStopped(!next)
      toast.error('บันทึกไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success(
      next
        ? `งดจำหน่าย "${product.name}" แล้ว — เอาออกจากทุกช่องทางขาย`
        : `กลับมาขาย "${product.name}" ได้แล้ว`,
    )
    router.refresh()
  }

  return (
    <input
      type="checkbox"
      checked={stopped}
      disabled={busy}
      onChange={(e) => toggle(e.target.checked)}
      aria-label="งดจำหน่าย"
      title={stopped ? 'งดจำหน่ายอยู่ — ติ๊กออกเพื่อกลับมาขาย' : 'ติ๊กเพื่องดจำหน่าย เอาออกจากทุกช่องทางขาย'}
      className="w-4 h-4 accent-red-600 disabled:opacity-50"
    />
  )
}
