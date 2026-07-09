'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Gift } from 'lucide-react'
import toast from 'react-hot-toast'
import type { PointsConfig } from '@/lib/types'

export default function PointsSection({ config }: { config: PointsConfig | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    spend_amount: config?.spend_amount?.toString() ?? '100',
    earn_points: config?.earn_points?.toString() ?? '1',
    redeem_points: config?.redeem_points?.toString() ?? '100',
    redeem_value: config?.redeem_value?.toString() ?? '1',
  })

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('points_config')
      .update({
        spend_amount: parseFloat(form.spend_amount),
        earn_points: parseInt(form.earn_points),
        redeem_points: parseInt(form.redeem_points),
        redeem_value: parseFloat(form.redeem_value),
        updated_at: new Date().toISOString(),
      })
      .eq('id', config.id)
    setLoading(false)
    if (error) {
      toast.error('บันทึกไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success('บันทึกการตั้งค่าแต้มแล้ว')
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Gift size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">แต้มสะสม</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        ตอนนี้: ซื้อครบ ฿{form.spend_amount || '—'} ได้ {form.earn_points || '—'} แต้ม
        และใช้ {form.redeem_points || '—'} แต้มแทนเงินได้ ฿{form.redeem_value || '—'}
      </p>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
        <div>
          <label className={labelClass}>ยอดซื้อ (บาท)</label>
          <input
            type="number" required min="1" step="0.01" value={form.spend_amount}
            onChange={(e) => set('spend_amount', e.target.value)} className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>ได้แต้ม</label>
          <input
            type="number" required min="1" value={form.earn_points}
            onChange={(e) => set('earn_points', e.target.value)} className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>ใช้แต้ม</label>
          <input
            type="number" required min="1" value={form.redeem_points}
            onChange={(e) => set('redeem_points', e.target.value)} className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>แทนเงิน (บาท)</label>
          <input
            type="number" required min="0.01" step="0.01" value={form.redeem_value}
            onChange={(e) => set('redeem_value', e.target.value)} className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !config}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
        >
          {loading ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </form>
    </section>
  )
}
