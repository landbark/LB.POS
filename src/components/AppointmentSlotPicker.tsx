'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { slotGroups, slotOf } from '@/lib/appointmentSlots'
import { APPOINTMENT_TYPE_LABELS, type AppointmentType } from '@/lib/types'

interface BookedRow {
  id: string
  scheduled_at: string
  type: AppointmentType
  pets: { name: string; hn: string | null } | null
}

/**
 * เลือกเวลานัดเป็นช่องๆ ทุก 30 นาที (แบบเลือกรอบหนัง)
 *
 * ตัวเลขในช่อง = จำนวนตัวที่นัดไว้แล้วเวลานั้น เวลาเดียวนัดซ้ำได้ไม่จำกัด จึงไม่ปิดช่องไหนเพราะมีคนจองแล้ว
 */
export default function AppointmentSlotPicker({
  date,
  value,
  onChange,
  disabled = false,
  reloadKey = 0,
}: {
  /** 'YYYY-MM-DD' ตามเวลาเครื่อง */
  date: string
  /** 'HH:MM' หรือ '' ถ้ายังไม่เลือก */
  value: string
  onChange: (time: string) => void
  disabled?: boolean
  /** เปลี่ยนค่าแล้วโหลดจำนวนนัดใหม่ — ใช้หลังตั้งนัดสำเร็จ */
  reloadKey?: number
}) {
  // เก็บวันที่คู่กับผลลัพธ์ เปลี่ยนวันแล้วจะได้ไม่เห็นจำนวนนัดของวันเก่าค้างระหว่างโหลด
  const [loaded, setLoaded] = useState<{ date: string; rows: BookedRow[]; failed: boolean }>({ date: '', rows: [], failed: false })

  useEffect(() => {
    if (!date) return
    let cancelled = false
    async function load() {
      const start = new Date(`${date}T00:00`)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      const { data, error } = await createClient()
        .from('appointments')
        .select('id, scheduled_at, type, pets(name, hn)')
        .eq('status', 'scheduled')
        .gte('scheduled_at', start.toISOString())
        .lt('scheduled_at', end.toISOString())
        .order('scheduled_at')
      if (!cancelled) setLoaded({ date, rows: (data ?? []) as unknown as BookedRow[], failed: !!error })
    }
    load()
    return () => { cancelled = true }
  }, [date, reloadKey])

  const ready = loaded.date === date
  const bySlot: Record<string, BookedRow[]> = {}
  if (ready) for (const r of loaded.rows) (bySlot[slotOf(new Date(r.scheduled_at))] ??= []).push(r)

  const inSlot = value ? bySlot[value] ?? [] : []

  return (
    <div>
      <div className="space-y-2">
        {slotGroups(Object.keys(bySlot)).map((g) => (
          <div key={g.label} className="flex items-start gap-2">
            <span className="w-8 shrink-0 pt-2.5 text-xs font-medium text-gray-400">{g.label}</span>
            <div className="flex-1 grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1.5">
              {g.slots.map((slot) => {
                const count = bySlot[slot]?.length ?? 0
                const selected = slot === value
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => onChange(slot)}
                    title={count > 0 ? `นัดแล้ว ${count} ตัว: ${bySlot[slot].map((r) => r.pets?.name ?? '—').join(', ')}` : 'ยังไม่มีนัด'}
                    className={`flex flex-col items-center justify-center h-11 rounded-lg border leading-tight transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      selected
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : count > 0
                          ? 'bg-amber-50 border-amber-300 text-amber-900 enabled:hover:border-amber-500'
                          : 'bg-white border-gray-300 text-gray-700 enabled:hover:border-blue-500 enabled:hover:bg-blue-50'
                    }`}
                  >
                    <span className="text-sm font-medium tabular-nums">{slot}</span>
                    {count > 0 && (
                      <span className={`text-[10px] ${selected ? 'text-blue-100' : 'text-amber-700'}`}>{count} ตัว</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {ready && loaded.failed && (
        <p className="mt-2 text-xs text-red-600">โหลดจำนวนนัดของวันนี้ไม่สำเร็จ — ยังเลือกเวลาได้ตามปกติ</p>
      )}
      {inSlot.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          {value} นัดไว้แล้ว {inSlot.length} ตัว:{' '}
          {inSlot.map((r) => `${r.pets?.name ?? '—'} (${APPOINTMENT_TYPE_LABELS[r.type]})`).join(', ')} — นัดซ้ำได้
        </p>
      )}
    </div>
  )
}
