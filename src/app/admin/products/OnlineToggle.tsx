'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'

// สวิตช์เปิด/ปิดขายบนเว็บ ตรงจากตารางสินค้า — ไม่ต้องเข้าไปแก้ทีละตัว
export default function OnlineToggle({ product, clinicOnly }: { product: Product; clinicOnly: boolean }) {
  const router = useRouter()
  const [online, setOnline] = useState(product.online_available)
  const [busy, setBusy] = useState(false)

  // ของคลินิกไม่ขึ้นเว็บอยู่แล้ว (ระบบกรองออกให้) — ไม่ต้องมีสวิตช์
  if (clinicOnly) {
    return <span className="text-xs text-gray-400" title="ของคลินิกไม่ขึ้นหน้าเว็บ">—</span>
  }

  async function toggle() {
    const next = !online
    // เปิดขายออนไลน์แต่ไม่มีน้ำหนัก = คิดค่าส่งไม่ได้ ต้องใส่น้ำหนักก่อน
    if (next && !product.is_service && product.weight_grams == null) {
      toast.error('ใส่น้ำหนักสินค้าก่อน ถึงจะขายบนเว็บได้ (ใช้คิดค่าส่ง)')
      return
    }

    setBusy(true)
    setOnline(next)
    const supabase = createClient()
    const { error } = await supabase
      .from('products')
      .update({ online_available: next })
      .eq('id', product.id)
    setBusy(false)

    if (error) {
      setOnline(!next)
      toast.error('บันทึกไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success(next ? `"${product.name}" ขึ้นขายบนเว็บแล้ว` : `เอา "${product.name}" ออกจากเว็บแล้ว`)
    router.refresh()
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={online}
      aria-label={online ? 'ปิดการขายบนเว็บ' : 'เปิดขายบนเว็บ'}
      title={online ? 'กำลังขายบนเว็บ — กดเพื่อเอาออก' : 'ยังไม่ขายบนเว็บ — กดเพื่อเปิดขาย'}
      onClick={toggle}
      disabled={busy}
      className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-50 ${
        online ? 'bg-green-500' : 'bg-gray-200'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          online ? 'translate-x-4' : ''
        }`}
      />
    </button>
  )
}
