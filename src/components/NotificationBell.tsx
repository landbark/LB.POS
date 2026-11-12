'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Bell, ShoppingBag, Receipt, Ban, RotateCcw, CalendarClock, Check, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AppNotification, AppNotificationKind } from '@/lib/types'

/**
 * กระดิ่งแจ้งเตือนในระบบ — ใช้ได้ทั้งหน้าขายและหลังร้าน
 *
 * ทำไมต้องมี: แจ้งเตือนของเดิมมีทางเดียวคือ Telegram ซึ่งเข้าเครื่องเจ้าของ
 * ออเดอร์ออนไลน์เข้ามาแล้วคนที่ยืนอยู่หน้าขายไม่รู้เลย ต้องเดินเข้าเมนูจัดการร้านไปดูเอง
 *
 * ถามตรงไปที่ Supabase จากเบราว์เซอร์ ไม่ผ่าน route ของเราเอง — Cloudflare คิดเงินตาม
 * จำนวนครั้งที่ worker ตื่น การ poll ทุกนาทีผ่าน API ของตัวเองเลยแพงโดยไม่จำเป็น
 * และหยุดถามเมื่อแท็บไม่ได้ถูกมองอยู่ (แท็บหน้าขายเปิดค้างทั้งวันเป็นเรื่องปกติ)
 */

const ICONS: Record<AppNotificationKind, typeof Bell> = {
  new_order: ShoppingBag,
  payment_slip: Receipt,
  receipt_cancelled: Ban,
  product_return: RotateCcw,
  new_appointment: CalendarClock,
  member_link: Link2,
}

const TONE: Record<AppNotificationKind, string> = {
  new_order: 'bg-blue-100 text-blue-600',
  payment_slip: 'bg-emerald-100 text-emerald-600',
  receipt_cancelled: 'bg-red-100 text-red-600',
  product_return: 'bg-teal-100 text-teal-600',
  new_appointment: 'bg-purple-100 text-purple-600',
  member_link: 'bg-amber-100 text-amber-700',
}

/** ย้อนหลังกี่วันที่ยังถือว่าน่าสนใจ — ของเก่ากว่านี้มีหน้าของตัวเองให้ดูอยู่แล้ว */
const LOOKBACK_DAYS = 7
const MAX_ROWS = 30
/** ความกว้างกล่องรายการ (21rem) — ใช้คำนวณว่าจะกางไปทางไหนไม่ให้ตกขอบจอ */
const PANEL_WIDTH = 336

interface Row extends AppNotification {
  read: boolean
}

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const same = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) === today
  return same
    ? d.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) + ' น.'
    : d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** เสียงติ๊งสั้น ๆ ตอนมีของใหม่ — สร้างจาก WebAudio ไม่ต้องมีไฟล์เสียงในโปรเจกต์ */
function ding() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.36)
    osc.onended = () => ctx.close().catch(() => {})
  } catch {
    // เบราว์เซอร์ยังไม่อนุญาตให้เล่นเสียงก่อนมีคนแตะหน้าจอ — ไม่ใช่เรื่องที่ต้องหยุดอะไร
  }
}

export default function NotificationBell({
  userId,
  pollMs = 60_000,
  /** ขึ้น toast + เสียงตอนมีของใหม่ — เปิดเฉพาะหน้าขาย ที่คนยืนอยู่ตรงนั้นจริง */
  announce = false,
  className = '',
  iconColor,
}: {
  userId: string
  pollMs?: number
  announce?: boolean
  className?: string
  iconColor?: string
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [open, setOpen] = useState(false)
  const router = useRouter()
  // ไอดีที่เห็นแล้วในรอบนี้ของหน้า — รอบแรกเก็บเงียบ ๆ ไม่ขึ้น toast ย้อนหลังทั้งกอง
  const seen = useRef<Set<string> | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  // กางไปทางขวาแทนซ้าย เมื่อกระดิ่งอยู่ชิดขอบซ้ายจอ (กระดิ่งในลิ้นชักเมนูหลังร้าน)
  const [alignLeft, setAlignLeft] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
    const { data } = await supabase
      .from('app_notifications')
      .select('id, kind, title, body, link, created_at, app_notification_reads(profile_id)')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS)

    const next: Row[] = ((data ?? []) as unknown as (AppNotification & { app_notification_reads: { profile_id: string }[] })[])
      .map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        link: n.link,
        created_at: n.created_at,
        read: (n.app_notification_reads ?? []).some((r) => r.profile_id === userId),
      }))

    setRows(next)

    if (seen.current === null) {
      seen.current = new Set(next.map((n) => n.id))
      return
    }
    const fresh = next.filter((n) => !seen.current!.has(n.id) && !n.read)
    for (const n of next) seen.current.add(n.id)
    if (announce && fresh.length > 0) {
      ding()
      for (const n of fresh.slice(0, 3)) {
        toast(n.title, { icon: '🔔', duration: 8000 })
      }
    }
  }, [userId, announce])

  useEffect(() => {
    if (!userId) return
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      load()
      timer = setInterval(load, pollMs)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop())

    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId, pollMs, load])

  // แตะที่อื่นแล้วปิดรายการ
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const unread = rows.filter((r) => !r.read)

  async function markRead(ids: string[]) {
    if (ids.length === 0) return
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, read: true } : r)))
    const supabase = createClient()
    await supabase
      .from('app_notification_reads')
      .upsert(ids.map((id) => ({ notification_id: id, profile_id: userId })), {
        onConflict: 'notification_id,profile_id',
      })
  }

  /**
   * วัดตำแหน่งกระดิ่งตอนกดเปิด แล้วเลือกข้างที่กางแล้วไม่ตกขอบจอ
   * วัดตอนกด ไม่ใช่ใน effect เพราะตำแหน่งเปลี่ยนได้ระหว่างที่หน้ายังเปิดอยู่ (ย่อจอ/เลื่อนแถบ)
   *
   * ปกติกางไปทางซ้าย (กระดิ่งอยู่มุมขวาบน) — สลับไปทางขวาเฉพาะตอนกางซ้ายแล้วตกขอบซ้าย
   * และกางขวาแล้วยังอยู่ในจอ ไม่งั้นจอแคบ ๆ จะย้ายจากตกขอบซ้ายไปตกขอบขวาแทน
   */
  function toggle() {
    if (!open) {
      const rect = boxRef.current?.getBoundingClientRect()
      const vw = window.innerWidth
      // กล่องถูกบีบด้วย max-w-[calc(100vw-1.5rem)] บนจอแคบ ใช้ความกว้างจริงมาคิด
      const w = Math.min(PANEL_WIDTH, vw - 24)
      setAlignLeft(!!rect && rect.right - w < 8 && rect.left + w <= vw - 8)
    }
    setOpen((v) => !v)
  }

  function openRow(row: Row) {
    markRead([row.id])
    setOpen(false)
    if (row.link) router.push(row.link)
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        onClick={toggle}
        aria-label={unread.length > 0 ? `แจ้งเตือน ${unread.length} รายการใหม่` : 'แจ้งเตือน'}
        className="relative flex items-center p-2 rounded-lg"
        style={iconColor ? { color: iconColor } : undefined}
      >
        <Bell size={18} />
        {unread.length > 0 && (
          <span
            className="absolute top-0.5 right-0.5 min-w-4.5 h-4.5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: '#D9534F', color: '#fff' }}
          >
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute ${alignLeft ? 'left-0' : 'right-0'} top-full mt-1 w-[21rem] max-w-[calc(100vw-1.5rem)] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">แจ้งเตือน</span>
            {unread.length > 0 && (
              <button
                onClick={() => markRead(unread.map((r) => r.id))}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Check size={13} /> อ่านทั้งหมด
              </button>
            )}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {rows.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-gray-400">
                ไม่มีแจ้งเตือนใน {LOOKBACK_DAYS} วันที่ผ่านมา
              </p>
            )}
            {rows.map((r) => {
              const Icon = ICONS[r.kind] ?? Bell
              return (
                <button
                  key={r.id}
                  onClick={() => openRow(r)}
                  className={`w-full text-left flex gap-2.5 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 ${r.read ? '' : 'bg-amber-50/60'}`}
                >
                  <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${TONE[r.kind] ?? 'bg-gray-100 text-gray-600'}`}>
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm leading-snug ${r.read ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                      {r.title}
                    </span>
                    {r.body && <span className="block text-xs text-gray-500 leading-snug mt-0.5">{r.body}</span>}
                    <span className="block text-[11px] text-gray-400 mt-0.5">{fmtTime(r.created_at)}</span>
                  </span>
                  {!r.read && <span className="shrink-0 w-2 h-2 rounded-full bg-red-500 mt-2" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
