'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()

  async function handleDelete() {
    if (!confirm(`ลบสินค้า "${name}" ?`)) return

    const supabase = createClient()
    const { error } = await supabase
      .from('products')
      .update({ active: false })
      .eq('id', id)

    if (error) {
      toast.error('เกิดข้อผิดพลาด')
      return
    }

    toast.success('ปิดการใช้งานสินค้าแล้ว')
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
    >
      <Trash2 size={15} />
    </button>
  )
}
