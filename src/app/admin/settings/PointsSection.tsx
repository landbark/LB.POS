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
  const [enabled, setEnabled] = useState(config?.enabled ?? true)
  const [toggling, setToggling] = useState(false)
  const [form, setForm] = useState({
    spend_amount: config?.spend_amount?.toString() ?? '100',
    earn_points: config?.earn_points?.toString() ?? '1',
    redeem_points: config?.redeem_points?.toString() ?? '100',
    redeem_value: config?.redeem_value?.toString() ?? '1',
    expiry_days: config?.expiry_days?.toString() ?? '365',
  })

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // สลับเปิด/ปิดแล้วบันทึกทันที ไม่ต้องกดปุ่มบันทึกซ้ำ
  async function toggleEnabled(next: boolean) {
    if (!config) return
    setToggling(true)
    setEnabled(next)
    const supabase = createClient()
    const { error } = await supabase
      .from('points_config')
      .update({ enabled: next, updated_at: new Date().toISOString() })
      .eq('id', config.id)
    setToggling(false)
    if (error) {
      setEnabled(!next)
      toast.error('บันทึกไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success(next ? 'เปิดระบบสะสมแต้มแล้ว' : 'ปิดระบบสะสมแต้มแล้ว')
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!config || !enabled) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('points_config')
      .update({
        spend_amount: parseFloat(form.spend_amount),
        earn_points: parseInt(form.earn_points),
        redeem_points: parseInt(form.redeem_points),
        redeem_value: parseFloat(form.redeem_value),
        expiry_days: parseInt(form.expiry_days) || 0,
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
        {enabled ? (
          <>
            ตอนนี้: ซื้อครบ ฿{form.spend_amount || '—'} ได้ {form.earn_points || '—'} แต้ม
            และใช้ {form.redeem_points || '—'} แต้มแทนเงินได้ ฿{form.redeem_value || '—'}
            {' · '}
            {parseInt(form.expiry_days) > 0
              ? `แต้มแต่ละก้อนมีอายุ ${form.expiry_days} วันนับจากวันที่ได้มา`
              : 'แต้มไม่มีวันหมดอายุ'}
          </>
        ) : (
          'ปิดอยู่ — หน้าขายจะไม่คิดแต้มให้ลูกค้าและใช้แต้มแทนเงินไม่ได้ (แต้มที่ลูกค้าสะสมไว้แล้วยังอยู่ครบ เปิดกลับมาเมื่อไหร่ก็ใช้ได้)'
        )}
      </p>

      <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!config || toggling}
          onChange={(e) => toggleEnabled(e.target.checked)}
          className="w-4 h-4 accent-blue-600"
        />
        เปิดใช้ระบบสะสมแต้ม
      </label>

      <form
        onSubmit={handleSubmit}
        className={`grid grid-cols-2 md:grid-cols-6 gap-4 items-end ${enabled ? '' : 'opacity-50 pointer-events-none'}`}
      >
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
        <div>
          <label className={labelClass}>อายุแต้ม (วัน)</label>
          <input
            type="number" required min="0" step="1" value={form.expiry_days}
            onChange={(e) => set('expiry_days', e.target.value)} className={inputClass}
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

      {enabled && (
        <p className="text-xs text-gray-500 mt-3">
          เปลี่ยนอายุแต้มแล้วมีผลกับแต้มที่ได้หลังจากนี้เท่านั้น — ก้อนที่ลูกค้าถืออยู่ยังใช้วันหมดอายุเดิม ·
          ใส่ 0 = ไม่มีวันหมดอายุ · ตอนลูกค้าใช้แต้ม ระบบตัดก้อนที่ใกล้หมดอายุก่อนเสมอ
        </p>
      )}
    </section>
  )
}
