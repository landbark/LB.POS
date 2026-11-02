'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { checkChannels, expectedCash as computeExpectedCash, splitShiftBills, type ShiftBill } from '@/lib/shiftCash'
import { BANKNOTES, COINS, DENOMS, ownerSide, planByDenom, planOwnerTake } from '@/lib/shiftFloat'
import { DEFAULT_TRANSFER_ACCOUNTS, PAYMENT_DOT, PAYMENT_LABEL, sumBankMethods } from '@/lib/payments'
import { CHANNEL_GROUPS } from '@/lib/salesChannel'
import type { PaymentMethod, SalesChannel } from '@/lib/types'
import { Wallet, Lock, Unlock, Pencil, StickyNote, ArrowRightLeft, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/lib/confirm'
import OpenShiftModal from '@/components/OpenShiftModal'
import type { Shift, CashMovement } from '@/lib/types'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })


// คอลัมน์ใหม่จาก supabase-migration-shift-denominations.sql (ยังไม่อยู่ใน type Shift กลาง)
type ShiftRow = Shift & {
  opening_denominations?: Record<string, number> | null
  closing_transfers?: Record<string, number> | null
  carry_denominations?: Record<string, number> | null
  carry_adjusted_at?: string | null
  closing_denominations?: Record<string, number> | null
  cash_to_owner?: number | null
  owner_denominations?: Record<string, number> | null
}

// ใบนับเงินทอนที่กะหนึ่งส่งต่อให้กะถัดไป — เจ้าของจัดทีหลังแล้วใช้ของที่จัด ไม่งั้นใช้ที่เหลือตอนปิด
const carryDenomsOf = (s: ShiftRow | undefined): Record<number, number> | null => {
  if (!s) return null
  if (s.carry_denominations) {
    const adj = s.carry_denominations
    return Object.fromEntries(DENOMS.map((d) => [d.value, adj[d.value] ?? 0]))
  }
  if (!s.closing_denominations) return null
  const close = s.closing_denominations
  const owner = s.owner_denominations ?? {}
  return Object.fromEntries(DENOMS.map((d) => [d.value, (close[d.value] ?? 0) - (owner[d.value] ?? 0)]))
}

// เงินที่กะหนึ่งต้องส่งต่อให้กะถัดไป (ปิดโดยไม่นับ = เทียบไม่ได้)
const carryOf = (s: ShiftRow | undefined) => {
  if (!s) return null
  if (s.carry_denominations) {
    const adj = s.carry_denominations
    return DENOMS.reduce((sum, d) => sum + d.value * (adj[d.value] ?? 0), 0)
  }
  return s.closing_cash_counted != null ? Number(s.closing_cash_counted) - Number(s.cash_to_owner ?? 0) : null
}

// สรุปรายละเอียดแบงค์เป็นข้อความ เช่น "แบงค์พัน × 3\nแบงค์ร้อย × 5" (ใช้เป็น tooltip ในประวัติกะ)
// owner_denominations ติดลบได้ — ลบคือเจ้าของเติมใบนั้นเข้าเก๊ะ ไม่ใช่หยิบออก
const denomTitle = (den: Record<string, number> | null | undefined) =>
  den
    ? DENOMS.filter((d) => den[String(d.value)])
        .map((d) => {
          const q = den[String(d.value)]
          return q < 0 ? `${d.label} เติมเข้า ${-q}` : `${d.label} × ${q}`
        })
        .join('\n') || undefined
    : undefined

export default function ShiftClient({
  openShift,
  history,
  currentUserId,
  currentUserName,
  canEditClosed,
  floatTarget,
  floatDenoms,
  floatKeep,
  transferAccounts,
  storeName,
}: {
  openShift: ShiftRow | null
  history: ShiftRow[]
  currentUserId: string
  currentUserName: string
  canEditClosed: boolean
  /** เงินทอนที่ต้องเหลือไว้ทุกเช้า — null = ร้านยังไม่ได้ตั้ง (ตั้งได้ที่หน้าตั้งค่า) */
  floatTarget: number | null
  /** เงินทอนแยกรายชนิด — ตั้งไว้แล้วจะคิดให้ว่าต้องหยิบชนิดไหนออกกี่ใบ แทนการคิดจากยอดรวม */
  floatDenoms: Record<string, number> | null
  /** ชนิดที่เก็บไว้ทั้งหมด — ไม่หยิบออก ไม่เตือนว่าขาด (แบงค์ห้าสิบที่แลกมาไม่ได้) */
  floatKeep: number[] | null
  /** บัญชี/กระเป๋าที่ให้กรอกยอดโอนจริงตอนปิดกะ · null = ยังไม่ได้ตั้ง ใช้ชุดเริ่มต้น */
  transferAccounts: string[] | null
  /** ชื่อร้านบนหัวใบสรุปที่พิมพ์ออกมา */
  storeName: string
}) {
  const router = useRouter()
  const [showOpenShift, setShowOpenShift] = useState(false)
  const [counts, setCounts] = useState<Record<number, string>>({})
  // เงินทอนที่จะเหลือไว้ให้กะถัดไป แยกรายชนิด · null = ยังไม่แตะ ใช้ชุดเงินทอนที่ตั้งไว้เป็นค่าตั้งต้น
  // ไม่มีช่อง "แยกให้เจ้าของ" แล้ว — ยอดนั้นคิดจากส่วนต่างกับใบนับ (ดู lib/shiftFloat → ownerSide)
  const [keepEdit, setKeepEdit] = useState<Record<number, string> | null>(null)
  // ไม่ติ๊กไว้ให้ — เคยติ๊กค้างแล้วคนปิดกะไม่ทันสังเกตว่ามีกะใหม่เปิดต่อ เช้ามาเห็นกะค้างอยู่
  // นึกว่าเมื่อวานลืมปิด เลยปิดแล้วเปิดใหม่อีกรอบ กลายเป็นกะเกินมาทุกวัน
  const [reopenNext, setReopenNext] = useState(false)
  // กะที่ปิดไปแล้วแต่กรอกยอดผิด — เปิดกล่องแก้ไขจากตารางประวัติ
  const [editing, setEditing] = useState<ShiftRow | null>(null)
  // แถวประวัติที่กางหมายเหตุอยู่ — หมายเหตุคือที่เก็บ audit ว่าเงินตั้งต้นไม่ตรงยอดยกมา/ใครแก้ยอด
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [editCounted, setEditCounted] = useState('')
  const [editOwner, setEditOwner] = useState('')
  const [editNote, setEditNote] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [breakdown, setBreakdown] = useState<Record<string, number>>({})
  const [methodBills, setMethodBills] = useState<Record<string, number>>({})
  const [salesTotal, setSalesTotal] = useState(0)
  const [billCount, setBillCount] = useState(0)
  // ยอดขายช่องทางอื่นในช่วงกะเดียวกัน (บูธ/ออนไลน์) — ไม่เข้าเก๊ะ แต่กลุ่มไลน์อยากเห็นในรูปเดียวกัน
  const [otherChannels, setOtherChannels] = useState<{ label: string; amount: number; count: number }[]>([])
  // ยอดที่เช็คได้จากแอปธนาคารตอนปิดกะ แยกตามบัญชี — ว่างหมด = ยังไม่ได้เช็ค ไม่เตือนอะไร
  const [transfers, setTransfers] = useState<Record<string, string>>({})
  // เวลาที่พิมพ์ใบสรุป — ตั้งตอนกดพิมพ์เท่านั้น (คิดตอน render จะได้ HTML ฝั่ง server ไม่ตรงกับ client)
  const [printedAt, setPrintedAt] = useState('')
  const [cashRefunds, setCashRefunds] = useState(0)
  // เงินสดจากบิลในกะนี้ที่ถูกยกเลิกทีหลัง — รับไว้แล้วตอนขาย ต้องนับเป็นเงินเข้าเก๊ะ (ดู lib/shiftCash)
  const [cashFromCancelled, setCashFromCancelled] = useState(0)
  const [cancelledBills, setCancelledBills] = useState(0)
  // เงินเข้า-ออกเก๊ะระหว่างกะ (เจ้าของมารับ / เอาเงินทอนมาเติม / จ่ายค่าส่งของ)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [moveDir, setMoveDir] = useState<'in' | 'out'>('out')
  const [moveAmount, setMoveAmount] = useState('')
  const [moveReason, setMoveReason] = useState('')
  const [moveBusy, setMoveBusy] = useState(false)
  // จัดเงินทอนหลังปิดกะ — เจ้าของมาแลก/เติมทีหลังตอนพนักงานกลับไปแล้ว (เจ้าของเท่านั้น)
  const lastClosed = history[0] as ShiftRow | undefined
  const carryBefore = carryDenomsOf(lastClosed)
  const [adjust, setAdjust] = useState<Record<number, string> | null>(null)
  const [adjustNote, setAdjustNote] = useState('')
  // แก้เงินตั้งต้นของกะที่เปิดอยู่ (เจ้าของเท่านั้น)
  const [editOpening, setEditOpening] = useState(false)
  const [openingEdit, setOpeningEdit] = useState('')
  const [openingNote, setOpeningNote] = useState('')

  const stampNow = () =>
    new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  // ชื่อไฟล์ PDF เช่น "LANDBARK-ปิดกะ-2026-11-02-2305" — วันที่แบบ ISO เพราะเรียงตามชื่อแล้วตรงตามเวลา
  const printFileName = () => {
    const now = new Date()
    const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    const time = now
      .toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
      .replace(':', '')
    return [storeName.trim().replace(/\s+/g, '-'), 'ปิดกะ', date, time].filter(Boolean).join('-')
  }
  // ชื่อแท็บเดิม — เก็บไว้ครั้งแรกที่กดพิมพ์ ไม่งั้นกดรอบสองจะจำชื่อไฟล์ของรอบแรกเป็นของเดิม
  const pageTitle = useRef<string | null>(null)

  /**
   * พิมพ์ใบสรุป / เซฟเป็น PDF ก่อนกดปิดกะ
   *
   * ใบนี้คิดจากเลขที่กรอกค้างอยู่บนหน้าจอ ยังไม่ได้บันทึกอะไรลงฐานข้อมูล — ตั้งใจให้เป็นแบบนั้น
   * พนักงานจะได้ส่งใบสรุปเข้ากลุ่มก่อน แล้วถ้านับพลาดก็แก้ตัวเลขแล้วพิมพ์ใหม่ได้ ไม่ต้องปิดกะก่อน
   * (ปิดไปแล้วเหลือแค่เจ้าของที่แก้ยอดได้จากตารางประวัติ)
   *
   * flushSync เพื่อให้เวลาบนหัวใบถูกวาดลง DOM ก่อน window.print() จะหยุดเธรด
   *
   * เบราว์เซอร์ตั้งชื่อไฟล์ "บันทึกเป็น PDF" จาก document.title — ปล่อยไว้จะได้ "LANDBARK POS.pdf"
   * ทุกใบ ส่งเข้ากลุ่มแล้วทับกันเอง หาไม่เจอว่าใบไหนของวันไหน เปลี่ยนชื่อแท็บชั่วคราวตอนพิมพ์แทน
   * แล้วคืนค่าเมื่อกล่องพิมพ์ปิด (afterprint) — ไม่ใช้ตัวตั้งเวลา เพราะกล่องเปิดค้างนานแค่ไหนก็ได้
   */
  const printSummary = () => {
    if (pageTitle.current === null) pageTitle.current = document.title
    flushSync(() => setPrintedAt(stampNow()))
    document.title = printFileName()
    const restore = () => {
      document.title = pageTitle.current!
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
  }

  useEffect(() => {
    if (!openShift) return
    let cancelled = false

    async function loadSummary(shift: Shift) {
      const supabase = createClient()
      const [{ data: sold }, { data: refunds }, { data: moves }] = await Promise.all([
        // ดึงทุกช่องทางมา แล้วคัดเฉพาะ 'store' ไปคิดเงินในเก๊ะ — ที่เหลือโชว์เป็นบรรทัดข้อมูลในสรุป
        // ยอดขายที่บูธไม่เข้าเก๊ะที่ร้าน — คนที่ไปงานถือเงินทอนแยกไปต่างหาก (ดูสรุปที่ /admin/booth)
        // ขายผ่านแพลตฟอร์ม (Shopee/TikTok/Lazada) ก็ไม่ใช่เงินที่รับหน้าร้าน แพลตฟอร์มหักค่าธรรมเนียมแล้วโอนทีหลัง
        // ไม่กรอง status — บิลที่ยกเลิกทีหลังก็เคยรับเงินสดเข้าเก๊ะตอนขาย ต้องเอามาคิดด้วย
        supabase.from('transactions').select('status, total, payment_method, sales_channel, transaction_payments(method, amount)').gte('created_at', shift.opened_at),
        supabase.from('transactions').select('total').eq('status', 'cancelled').eq('refund_method', 'cash').gte('cancelled_at', shift.opened_at),
        supabase.from('cash_movements').select('*, profiles(name)').eq('shift_id', shift.id).order('created_at'),
      ])
      if (cancelled) return
      setMovements((moves as unknown as CashMovement[]) ?? [])
      const all = (sold ?? []) as unknown as (ShiftBill & { sales_channel: SalesChannel })[]
      const split = splitShiftBills(all.filter((b) => b.sales_channel === 'store'))
      setBreakdown(split.byMethod)
      setMethodBills(split.countByMethod)
      setSalesTotal(split.salesTotal)
      setBillCount(split.bills)
      setCashFromCancelled(split.cashFromCancelled)
      setCancelledBills(split.cancelledBills)
      setOtherChannels(
        CHANNEL_GROUPS.filter((g) => g.value !== 'store')
          .map((g) => {
            const rows = all.filter((b) => b.status !== 'cancelled' && g.channels.includes(b.sales_channel))
            return { label: g.label, amount: rows.reduce((sum, b) => sum + Number(b.total), 0), count: rows.length }
          })
          .filter((g) => g.count > 0),
      )
      setCashRefunds((refunds ?? []).reduce((s, t) => s + t.total, 0))
      setLoadingSummary(false)
    }

    loadSummary(openShift)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openShift?.id])

  const cashSales = breakdown.cash ?? 0
  const cashIn = movements.filter((m) => m.direction === 'in').reduce((s, m) => s + Number(m.amount), 0)
  const cashOut = movements.filter((m) => m.direction === 'out').reduce((s, m) => s + Number(m.amount), 0)
  // เงินที่ควรมีในลิ้นชัก = ตั้งต้น + ขายเงินสด + เงินสดจากบิลที่ยกเลิกทีหลัง − คืนเงินสด + เติมเข้า − หยิบออก
  const expectedCash = openShift
    ? computeExpectedCash({
        openingCash: openShift.opening_cash,
        cashSales, cashFromCancelled, cashRefunds, cashIn, cashOut,
      })
    : 0
  // กะที่ปิดล่าสุด = แถวแรกของประวัติ → เงินที่ควรยกมาให้กะที่เปิดอยู่
  const openingCarry = carryOf(history[0])
  const hasCount = DENOMS.some((d) => (counts[d.value] ?? '') !== '')
  const counted = DENOMS.reduce((s, d) => s + d.value * (parseInt(counts[d.value] || '0', 10) || 0), 0)
  const qtyOf = (c: Record<number, string>, v: number) => parseInt(c[v] || '0', 10) || 0
  const difference = counted - expectedCash
  // เงินเข้าบัญชี (โอน + QR) — ระบบรู้แค่ยอดที่พนักงานกด ส่วนยอดจริงต้องเปิดแอปดูแล้วกรอกเอง
  const accounts = transferAccounts ?? DEFAULT_TRANSFER_ACCOUNTS
  const bankExpected = sumBankMethods(breakdown)
  const bankChecked = accounts.some((a) => (transfers[a] ?? '').trim() !== '')
  const bankActual = accounts.reduce((sum, a) => sum + (parseFloat(transfers[a] || '0') || 0), 0)
  const bankDiff = bankChecked ? bankActual - bankExpected : 0
  // เงินสดขาดเท่าที่บัญชีเกินพอดี = ไม่มีเงินหาย แค่กดช่องทางผิดตอนรับเงิน (ดู lib/shiftCash)
  const channels = checkChannels(difference, bankDiff)
  // เงินทอนตั้งต้นคงที่ — กำหนดรายชนิดจะคิดทีละกอง (คุมได้ว่าเหลือเป็นแบงค์อะไร)
  // ตั้งแค่ยอดรวมก็ยังใช้ได้ แต่ไล่หยิบใบใหญ่ลงมาเฉย ๆ ไม่รู้ว่าเหลือแล้วทอนได้จริงไหม
  const floatTargetDenoms: Record<number, number> | null = floatDenoms
    ? Object.fromEntries(Object.entries(floatDenoms).map(([v, q]) => [Number(v), Number(q) || 0]))
    : null
  const countedDenoms: Record<number, number> = Object.fromEntries(
    DENOMS.map((d) => [d.value, qtyOf(counts, d.value)]),
  )
  const takeable = BANKNOTES.map((d) => d.value)
  const keepAll = floatKeep ?? []
  const floatPlan = !hasCount
    ? null
    : floatTargetDenoms
      ? planByDenom(countedDenoms, floatTargetDenoms, takeable, keepAll)
      : floatTarget != null
        ? planOwnerTake(countedDenoms, floatTarget, takeable)
        : null
  const floatTotal = floatTargetDenoms
    ? DENOMS.reduce((s, d) => s + d.value * (floatTargetDenoms[d.value] ?? 0), 0)
    : floatTarget
  // เหลือไว้เท่าไหร่ถ้าไม่แตะอะไรเลย — ร้านที่ตั้งชุดเงินทอนไว้ใช้ตามชุดนั้น ร้านที่ไม่ได้ตั้งก็เหลือไว้ทั้งหมด
  const keepDefault: Record<number, number> = floatPlan ? floatPlan.keep : countedDenoms
  const keepCounts: Record<number, number> = keepEdit
    ? Object.fromEntries(DENOMS.map((d) => [d.value, qtyOf(keepEdit, d.value)]))
    : keepDefault
  const keepValue = (v: number) =>
    keepEdit ? (keepEdit[v] ?? '') : keepDefault[v] ? String(keepDefault[v]) : ''
  // แตะช่องแรกแล้วต้องยึดทั้งชุดไว้ ไม่งั้นช่องที่เหลือจะเลื่อนตามค่าตั้งต้นที่ขยับทุกครั้งที่นับเพิ่ม
  const editKeep = (v: number, raw: string) =>
    setKeepEdit((c) => ({
      ...(c ?? Object.fromEntries(DENOMS.map((d) => [d.value, keepValue(d.value)]))),
      [v]: raw,
    }))
  // กดปุ่มเดียวให้เหลือในเก๊ะ "เท่าชุดที่ตั้งไว้พอดี" — ไม่ใช่ค่าที่ระบบคิดให้ซึ่งขาดก็เหลือไว้ทั้งเก๊ะ
  // แบงค์ที่ขาดจะขึ้นเป็น "เจ้าของเติม n" ให้เห็นทันทีว่าต้องเอาอะไรมาเติมกี่ใบ
  //
  // เหรียญก็ต้องสแน็ปขึ้นให้ถึงเป้าด้วย ไม่งั้นกดปุ่ม "ใช้ชุดที่ตั้งไว้ ฿4,000" แล้วยังขึ้นว่าขาดอยู่ ฿48
  // เพราะเหรียญบาทในเก๊ะมี 17 แต่ชุดต้องการ 50 — คนกดงงว่าตกลงกดไปทำไม (2 พ.ย. 69)
  // แต่สแน็ปลงไม่ได้: เหรียญที่เกินเป้าหยิบออกให้เจ้าของไม่ได้ ต้องคาไว้ในเก๊ะตามที่นับได้
  // ส่วนชนิดที่ตั้งว่าเก็บไว้ทั้งหมด (แบงค์ห้าสิบ) เหลือไว้ตามที่นับได้เสมอ ไม่มีเป้าให้เทียบ
  const applyFloatSet = () => {
    if (!floatTargetDenoms) return
    setKeepEdit(Object.fromEntries(DENOMS.map((d) => {
      const want = floatTargetDenoms[d.value] ?? 0
      const have = countedDenoms[d.value] ?? 0
      const qty = keepAll.includes(d.value)
        ? have
        : takeable.includes(d.value)
          ? want
          : Math.max(have, want)
      return [d.value, qty ? String(qty) : '']
    })))
  }
  // ให้เจ้าของ = ที่นับได้ − ที่เหลือไว้ · ติดลบ = วันที่เงินทอนขาดแล้วเจ้าของเอามาเติม
  const owner = ownerSide(countedDenoms, keepCounts)
  const cashToOwner = owner.net
  const leftover = DENOMS.reduce((s, d) => s + d.value * keepCounts[d.value], 0)
  // ชนิดที่เก็บไว้ทั้งหมดลอยไปตามที่รับมาจากลูกค้า — รวมเข้าเป้าตามที่นับได้ ไม่งั้นขึ้นว่าเกินทุกวัน
  const floatExpected = floatTotal == null
    ? null
    : floatTotal + keepAll.reduce((s, d) => s + d * qtyOf(counts, d), 0)
  const floatGap = floatExpected == null ? null : leftover - floatExpected
  // การ์ดจัดเงินทอนหลังปิดกะ
  const adjustQty = (v: number) => parseInt(adjust?.[v] || '0', 10) || 0
  const adjustTotal = DENOMS.reduce((sum, d) => sum + d.value * adjustQty(d.value), 0)
  const adjustDiff = adjustTotal - (carryOf(lastClosed) ?? 0)
  const keptLabels = DENOMS.filter((d) => keepAll.includes(d.value)).map((d) => d.label).join('/')
  // "พัน 3 · ร้อย 34 · ยี่สิบ 26" — ใบพิมพ์ไม่มีที่พอให้กางเป็นตาราง เอาเฉพาะกองที่มีของ
  const denomLine = (c: Record<number, number>) =>
    DENOMS.filter((d) => c[d.value]).map((d) => `${d.label.replace(/^(แบงค์|เหรียญ)/, '')} ${c[d.value]}`).join(' · ')
  // เงินตั้งต้นของกะที่เปิดอยู่ ห่างจากชุดเงินทอนที่ตั้งไว้เท่าไหร่ — ชนิดที่เก็บทั้งหมดคิดตามที่นับได้เช้านั้น
  // ไม่ได้นับแยกตอนเปิดกะและมีชนิดที่เก็บทั้งหมดอยู่ = เทียบไม่ได้ ไม่ต้องเตือน
  const openingDenoms = openShift?.opening_denominations ?? null
  const openingVsFloat =
    floatTotal == null || (keepAll.length > 0 && !openingDenoms) || !openShift
      ? null
      : openShift.opening_cash - (floatTotal + keepAll.reduce((s, d) => s + d * (openingDenoms?.[d] ?? 0), 0))
  // กองที่เงินทอนในเก๊ะยังไม่ครบชุด — ตัวที่เจ้าของต้องไปแลกมาเติม
  const carryShortages = floatTargetDenoms && carryBefore
    ? DENOMS.filter((d) => !keepAll.includes(d.value) && (floatTargetDenoms[d.value] ?? 0) > (carryBefore[d.value] ?? 0))
        .map((d) => ({ ...d, need: (floatTargetDenoms[d.value] ?? 0) - (carryBefore[d.value] ?? 0) }))
    : []

  async function addMovement() {
    if (!openShift) return
    const amount = parseFloat(moveAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('ใส่จำนวนเงินมากกว่า 0')
      return
    }
    setMoveBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('cash_movements')
      .insert({
        shift_id: openShift.id,
        direction: moveDir,
        amount,
        reason: moveReason.trim() || null,
        created_by: currentUserId,
      })
      .select('*, profiles(name)')
      .single()
    setMoveBusy(false)
    if (error) {
      toast.error('บันทึกไม่สำเร็จ: ' + error.message)
      return
    }
    setMovements((prev) => [...prev, data as unknown as CashMovement])
    setMoveAmount('')
    setMoveReason('')
    toast.success(moveDir === 'in' ? 'บันทึกเงินเข้าเก๊ะแล้ว' : 'บันทึกเงินออกจากเก๊ะแล้ว')
  }

  async function removeMovement(m: CashMovement) {
    if (!(await confirmDialog({
      message: `ลบรายการ ${m.direction === 'in' ? 'เติมเข้า' : 'หยิบออก'} ฿${money(Number(m.amount))}?`,
    })).confirmed) return
    const supabase = createClient()
    const { error } = await supabase.from('cash_movements').delete().eq('id', m.id)
    if (error) {
      toast.error('ลบไม่สำเร็จ: ' + error.message)
      return
    }
    setMovements((prev) => prev.filter((x) => x.id !== m.id))
  }

  /**
   * บันทึกใบนับเงินทอนหลังเจ้าของมาจัด — ไม่แตะใบนับของพนักงานตอนปิดกะ เก็บแยกคนละช่อง
   * ยอดยกมาของกะถัดไปจะอ่านจากตรงนี้แทน เช้ามาเทียบกับของจริงถึงจะไม่ขึ้นว่ากองไม่ตรงฟรี ๆ
   */
  async function saveCarry() {
    if (!lastClosed || !adjust) return
    const qty = (v: number) => parseInt(adjust[v] || '0', 10) || 0
    const after = DENOMS.reduce((sum, d) => sum + d.value * qty(d.value), 0)
    const before = carryOf(lastClosed) ?? 0
    const diff = after - before
    const changed = DENOMS.filter((d) => qty(d.value) !== (carryBefore?.[d.value] ?? 0))
    if (!changed.length) {
      toast.error('ยังไม่ได้เปลี่ยนอะไรเลย')
      return
    }
    const stamp = new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    const auditLine =
      `[จัดเงินทอนหลังปิดกะ ${stamp} โดย ${currentUserName || 'เจ้าของ'}] ` +
      `฿${money(before)} → ฿${money(after)} · ` +
      `${diff === 0 ? 'แลกเฉย ๆ ยอดเท่าเดิม' : diff > 0 ? `เติมเข้า ฿${money(diff)}` : `หยิบออก ฿${money(-diff)}`} · ` +
      `${changed.map((d) => `${d.label} ${carryBefore?.[d.value] ?? 0}→${qty(d.value)}`).join(' · ')}` +
      `${adjustNote.trim() ? ` · ${adjustNote.trim()}` : ''}`

    // ส่วนต่างต้องเข้ายอด "ให้เจ้าของ" ด้วย ไม่ใช่ลงแต่หมายเหตุ — ไม่งั้นเจ้าของหยิบเพิ่ม/เติมเข้าตอนมาจัด
    // เงินทอนแล้วคอลัมน์นี้ต่ำ/สูงไปเท่านั้น รวมทั้งเดือนก็เพี้ยนตามไปหมด (ยอดในแท็บประวัติ + ที่ส่งเข้า Telegram)
    const closing = lastClosed.closing_denominations
    const toOwner = lastClosed.closing_cash_counted != null
      ? Number(lastClosed.closing_cash_counted) - after
      : lastClosed.cash_to_owner ?? null
    const ownerDenoms = closing
      ? ownerSide(
          Object.fromEntries(DENOMS.map((d) => [d.value, closing[d.value] ?? 0])),
          Object.fromEntries(DENOMS.map((d) => [d.value, qty(d.value)])),
        ).signed
      : lastClosed.owner_denominations ?? null

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('shifts')
      .update({
        carry_denominations: Object.fromEntries(DENOMS.filter((d) => qty(d.value) > 0).map((d) => [d.value, qty(d.value)])),
        carry_adjusted_at: new Date().toISOString(),
        carry_adjusted_by: currentUserId,
        cash_to_owner: toOwner,
        owner_denominations: ownerDenoms,
        notes: [lastClosed.notes?.trim(), auditLine].filter(Boolean).join('\n'),
      })
      .eq('id', lastClosed.id)
    setLoading(false)
    if (error) {
      toast.error('บันทึกไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success(`บันทึกแล้ว — พรุ่งนี้เช้าเปิดกะด้วย ฿${money(after)}`)
    setAdjust(null)
    setAdjustNote('')
    router.refresh()
  }

  // แก้เงินตั้งต้นของกะที่เปิดอยู่ — เช้ามานับเงินในเก๊ะแล้วไม่ตรงกับที่ระบบยกมาให้
  async function saveOpeningCash() {
    if (!openShift) return
    const cash = parseFloat(openingEdit)
    if (isNaN(cash) || cash < 0) {
      toast.error('เงินตั้งต้นต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    setLoading(true)
    const stamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })
    const auditLine = `[แก้เงินตั้งต้น ${stamp} โดย ${currentUserName || 'พนักงาน'}] ฿${money(openShift.opening_cash)} → ฿${money(cash)}${openingNote.trim() ? ` · ${openingNote.trim()}` : ''}`
    const supabase = createClient()
    const { error } = await supabase
      .from('shifts')
      .update({
        opening_cash: cash,
        notes: [openShift.notes?.trim(), auditLine].filter(Boolean).join('\n'),
      })
      .eq('id', openShift.id)
    setLoading(false)
    if (error) {
      toast.error('แก้ไขไม่สำเร็จ: ' + error.message)
      return
    }
    setEditOpening(false)
    setOpeningNote('')
    toast.success('แก้เงินตั้งต้นแล้ว')
    router.refresh()
  }

  async function closeShift() {
    if (!openShift) return
    if (!hasCount) {
      toast.error('กรุณานับเงินอย่างน้อย 1 ช่อง (ถ้าไม่มีให้ใส่ 0)')
      return
    }
    // เคลียร์ช่อง "เหลือไว้" จนหมดแล้วกดปิดกะ = ยกเงินทอนออกไปทั้งเก๊ะ เช้ามาทอนไม่ได้สักบาท
    if (counted > 0 && leftover === 0) {
      if (!(await confirmDialog({
        message: `เหลือเงินทอนไว้ ฿0 — เงินในเก๊ะ ฿${money(counted)} ออกไปหาเจ้าของทั้งหมด พรุ่งนี้เปิดร้านโดยไม่มีเงินทอน ยืนยัน?`,
      })).confirmed) return
    }
    setLoading(true)
    const supabase = createClient()
    const denominations = Object.fromEntries(
      DENOMS.filter((d) => (counts[d.value] ?? '') !== '')
        .map((d) => [String(d.value), parseInt(counts[d.value], 10) || 0])
    )
    // ส่วนต่างรายชนิดแบบมีเครื่องหมาย — บวกคือหยิบออกให้เจ้าของ ลบคือเจ้าของเติมเข้า
    const ownerDenominations = Object.fromEntries(
      Object.entries(owner.signed).map(([v, q]) => [v, q]),
    )
    // ใบนับเงินทอนที่ยกไปให้กะถัดไป — กรอกตอนปิดกะไปเลย ไม่ต้องรอเจ้าของมาจัดทีหลัง
    const carryDenominations = Object.fromEntries(
      DENOMS.filter((d) => keepCounts[d.value] > 0).map((d) => [String(d.value), keepCounts[d.value]]),
    )
    const closeFields = {
        closed_at: new Date().toISOString(),
        closed_by: currentUserId,
        expected_cash: expectedCash,
        closing_cash_counted: counted,
        cash_difference: difference,
        closing_denominations: denominations,
        cash_to_owner: cashToOwner,
        owner_denominations: ownerDenominations,
        // สรุปเงินเข้า-ออกลงหมายเหตุด้วย เปิดดูประวัติกะย้อนหลังจะได้รู้ว่าทำไมยอดที่ควรมีไม่เท่ากับขายเงินสด
        notes: [
          // audit line ที่เขียนไว้ตอนเปิดกะ/แก้เงินตั้งต้น ต้องไม่หายไปตอนปิดกะ
          openShift.notes?.trim(),
          notes.trim(),
          movements.length > 0
            ? `เงินเข้าเก๊ะ ฿${money(cashIn)} · ออกจากเก๊ะ ฿${money(cashOut)} (${movements.length} รายการ)`
            : '',
          cashFromCancelled > 0 || cashRefunds > 0
            ? `บิลที่ยกเลิก: เงินสดที่รับไว้ ฿${money(cashFromCancelled)} · คืนเงินสด ฿${money(cashRefunds)}`
            : '',
          // เงินทอนขาดแล้วเจ้าของเอามาเติมตอนปิดกะ — เดิมไม่มีที่ลง ได้แต่ขึ้นเตือนแล้วปล่อยลอยไว้
          owner.net < 0
            ? `เจ้าของเติมเงินทอนเข้าเก๊ะ ฿${money(-owner.net)} (${DENOMS.filter((d) => owner.add[d.value]).map((d) => `${d.label} ${owner.add[d.value]}`).join(' · ')})`
            : '',
          // เช็คยอดบัญชีแล้วต้องจดไว้ ไม่งั้นพรุ่งนี้ไม่มีใครรู้ว่าวันนั้นเงินครบหรือหายจริง
          bankChecked
            ? `เข้าบัญชีจริง ฿${money(bankActual)} (${accounts.map((a) => `${a} ฿${money(parseFloat(transfers[a] || '0') || 0)}`).join(' · ')}) · ในระบบกดว่าโอน/QR ฿${money(bankExpected)}`
            : '',
          channels.swapped > 0
            ? `เงินครบทั้งก้อน แต่ลงช่องทางผิด ฿${money(channels.swapped)} — เงินสด${difference > 0 ? 'เกิน' : 'ขาด'} ฿${money(Math.abs(difference))} หักกับบัญชีที่${bankDiff > 0 ? 'เกิน' : 'ขาด'}เท่ากันพอดี`
            : '',
        ].filter(Boolean).join('\n') || null,
    }
    const carryFields = {
      carry_denominations: carryDenominations,
      // ยังไม่มีใครมาจัดทีหลัง — ใบนับนี้มาจากตอนปิดกะตรง ๆ
      carry_adjusted_at: null,
      carry_adjusted_by: null,
    }
    const save = (extra: Record<string, unknown>) =>
      supabase.from('shifts').update({ ...closeFields, ...extra }).eq('id', openShift.id)
    let { error } = await save({
      ...carryFields,
      closing_transfers: bankChecked
        ? Object.fromEntries(accounts.map((a) => [a, parseFloat(transfers[a] || '0') || 0]))
        : null,
    })
    // ยังไม่ได้รัน supabase-migration-shift-transfer-check.sql — ยอดที่เช็คได้ยังอยู่ในหมายเหตุอยู่ดี
    if (error) ({ error } = await save(carryFields))
    // ปิดกะต้องไม่พังเพราะเขียน carry ไม่ได้ — ยอดยกไปยังคิดจาก (นับได้ − ให้เจ้าของ) ได้ผลเท่ากัน
    // เขียนไม่ได้ได้สองเหตุ: ยังไม่ได้รัน migration จัดเงินทอนหลังปิดกะ (ไม่มีคอลัมน์)
    // หรือร้านยังไม่ได้รัน supabase-migration-shift-close-carry.sql แล้ว trigger กันพนักงานไว้
    if (error) ({ error } = await save({}))
    if (error) {
      setLoading(false)
      toast.error('เกิดข้อผิดพลาด: ' + error.message)
      return
    }

    // แจ้งเจ้าของทาง Telegram — ล้มเหลวก็ไม่เป็นไร กะปิดไปแล้ว
    fetch('/api/notify/shift-closed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftId: openShift.id }),
    }).catch(() => {})

    // เปิดกะถัดไปต่อเลยด้วยเงินคงเหลือหลังแยกแบงค์พัน (ร้านปิดกลางคืน ไม่มีกะดึก)
    if (reopenNext) {
      const { error: openError } = await supabase.from('shifts').insert({
        opening_cash: leftover,
        opened_by: currentUserId,
      })
      if (openError) {
        setLoading(false)
        toast.error('ปิดกะแล้ว แต่เปิดกะใหม่ไม่สำเร็จ: ' + openError.message)
        setCounts({})
        setKeepEdit(null)
        setNotes('')
        router.refresh()
        return
      }
      toast.success(`ปิดกะแล้ว และเปิดกะใหม่ด้วยเงินคงเหลือ ฿${money(leftover)}`)
    } else {
      toast.success('ปิดกะแล้ว — เช้ามากดเปิดกะใหม่ได้เลย')
    }
    setLoading(false)
    setCounts({})
    setKeepEdit(null)
    setTransfers({})
    setNotes('')
    router.refresh()
  }

  function startEdit(shift: ShiftRow) {
    setEditing(shift)
    setEditCounted(shift.closing_cash_counted != null ? String(shift.closing_cash_counted) : '')
    setEditOwner(shift.cash_to_owner != null ? String(shift.cash_to_owner) : '')
    setEditNote('')
  }

  async function saveEdit() {
    if (!editing) return
    const counted = parseFloat(editCounted)
    const toOwner = editOwner.trim() === '' ? 0 : parseFloat(editOwner)
    // toOwner ติดลบได้ — วันที่เงินทอนขาดแล้วเจ้าของเอาเงินมาเติมเข้าเก๊ะ
    if (Number.isNaN(counted) || counted < 0 || Number.isNaN(toOwner)) {
      toast.error('กรอกยอดเงินให้ถูกต้อง')
      return
    }
    if (toOwner > counted) {
      toast.error('เงินที่ให้เจ้าของมากกว่ายอดที่นับได้')
      return
    }

    const expected = Number(editing.expected_cash ?? 0)
    const previous = editing.closing_cash_counted
    const changedTotal = previous == null || Math.abs(Number(previous) - counted) > 0.001

    // ต่อท้ายหมายเหตุไว้เสมอ — บันทึกเงินไม่ควรถูกแก้แบบไร้ร่องรอย
    const stamp = new Date().toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
    })
    const auditLine = `[แก้ไข ${stamp} โดย ${currentUserName || 'พนักงาน'}] ยอดนับ ฿${money(Number(previous ?? 0))} → ฿${money(counted)}${editNote.trim() ? ` · ${editNote.trim()}` : ''}`
    const notes = [editing.notes?.trim(), auditLine].filter(Boolean).join('\n')

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('shifts')
      .update({
        closing_cash_counted: counted,
        cash_difference: counted - expected,
        cash_to_owner: toOwner,
        // ยอดรวมถูกแก้ด้วยมือแล้ว รายละเอียดใบละที่นับไว้เดิมจึงไม่ตรงอีก
        closing_denominations: changedTotal ? null : editing.closing_denominations,
        owner_denominations: changedTotal ? null : editing.owner_denominations,
        // ยอดยกไปคิดจาก carry ก่อนใบนับ — ปล่อยของเดิมไว้จะทับยอดที่เพิ่งแก้ด้วยมือ
        // ร้านที่ยังไม่ได้รัน migration จะไม่มีคีย์นี้มาตั้งแต่ตอน query — อย่าส่งไปให้คอลัมน์ที่ไม่มี
        ...('carry_denominations' in editing ? { carry_denominations: changedTotal ? null : editing.carry_denominations } : {}),
        notes,
      })
      .eq('id', editing.id)
    setLoading(false)

    if (error) {
      toast.error('แก้ไขไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success('แก้ไขยอดปิดกะแล้ว')
    setEditing(null)
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ปิดกะ / นับเงินสด</h1>
      <p className="text-sm text-gray-500 mb-6">กะเดียวรวมของร้าน ใครขายช่วงไหนก็รวมเข้ากะที่เปิดอยู่ ไม่บังคับเปิดกะก่อนขาย</p>

      {!openShift ? (
        <div className="flex flex-wrap items-start gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 w-full max-w-sm">
            <div className="flex items-center gap-2 mb-4">
              <Unlock size={18} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900">เปิดกะใหม่</h2>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              ใส่เงินทอนตั้งต้นในเก๊ะ · ถ้าวันนี้ขายไปแล้วตอนยังไม่เปิดกะ ระบบจะถามว่าจะรวมบิลพวกนั้นเข้ากะนี้ไหม
            </p>
            <button
              onClick={() => setShowOpenShift(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Wallet size={15} /> เปิดกะ
            </button>
          </div>

          {canEditClosed && lastClosed && carryBefore && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 w-full max-w-sm">
              <div className="flex items-center gap-2 mb-1">
                <ArrowRightLeft size={18} className="text-[#C4865A]" />
                <h2 className="font-semibold text-gray-900">จัดเงินทอนหลังปิดกะ</h2>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                ปิดกะไปแล้วแต่เพิ่งมาแลกแบงค์/เติมเหรียญให้ครบชุด — ลงตรงนี้ ใบนับของพนักงานตอนปิดกะไม่ถูกแก้
                และยอด &quot;ให้เจ้าของ&quot; ของกะนั้นจะขยับตามส่วนต่างให้เอง
                {lastClosed.carry_adjusted_at && (
                  <> · <span className="text-[#C4865A] font-medium">จัดไปแล้วเมื่อ {fmtDate(lastClosed.carry_adjusted_at)}</span></>
                )}
              </p>

              {adjust === null ? (
                <>
                  <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm space-y-1">
                    <div className="flex justify-between font-medium text-gray-900">
                      <span>เงินทอนในเก๊ะตอนนี้</span><span>฿{money(carryOf(lastClosed) ?? 0)}</span>
                    </div>
                    {floatTargetDenoms && (
                      <p className={`text-xs font-medium ${carryShortages.length ? 'text-red-600' : 'text-green-600'}`}>
                        {carryShortages.length
                          ? `ยังขาด: ${carryShortages.map((sh) => `${sh.label} อีก ${sh.need}`).join(' · ')}`
                          : 'ครบตามชุดเงินทอนที่ตั้งไว้'}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setAdjust(Object.fromEntries(
                      DENOMS.map((d) => [d.value, carryBefore[d.value] ? String(carryBefore[d.value]) : '']),
                    ))}
                    className="w-full flex items-center justify-center gap-2 border-2 border-[#C4865A] text-[#7A4E2D] hover:bg-[#C4865A]/10 text-sm font-medium px-4 py-2 rounded-lg"
                  >
                    <Pencil size={15} /> แลก / เติมเงินทอน
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-1.5 mb-3">
                    {DENOMS.map((d) => {
                      const qty = parseInt(adjust[d.value] || '0', 10) || 0
                      const was = carryBefore[d.value] ?? 0
                      const want = floatTargetDenoms?.[d.value] ?? 0
                      return (
                        <div key={d.value} className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 w-[5.5rem] shrink-0">{d.label}</span>
                          <input
                            type="number" min={0} step={1} inputMode="numeric"
                            value={adjust[d.value] ?? ''}
                            onChange={(e) => setAdjust((c) => ({ ...c!, [d.value]: e.target.value }))}
                            className={`w-16 border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 ${
                              want > qty ? 'border-red-300 focus:ring-red-400' : 'border-gray-300 focus:ring-[#C4865A]'
                            }`}
                            placeholder="0"
                          />
                          <span className="text-xs text-gray-400 flex-1 tabular-nums">
                            {qty !== was ? `เดิม ${was}` : ''}
                            {want > 0 && <span className={want > qty ? ' text-red-500 font-medium' : ''}> · ต้องการ {want}</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm space-y-1">
                    <div className="flex justify-between font-bold text-gray-900">
                      <span>รวมเงินทอนใหม่</span><span>฿{money(adjustTotal)}</span>
                    </div>
                    <p className={`text-xs font-medium ${adjustDiff === 0 ? 'text-gray-500' : adjustDiff > 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                      {adjustDiff === 0
                        ? `แลกเฉย ๆ ยอดเท่าเดิม ฿${money(carryOf(lastClosed) ?? 0)}`
                        : adjustDiff > 0
                          ? `เติมเงินเข้าเก๊ะ ฿${money(adjustDiff)}`
                          : `หยิบออกจากเก๊ะ ฿${money(-adjustDiff)}`}
                    </p>
                  </div>
                  <input
                    value={adjustNote}
                    onChange={(e) => setAdjustNote(e.target.value)}
                    placeholder="เหตุผล (ไม่ใส่ก็ได้) เช่น แลกร้อยเป็นยี่สิบ"
                    className={inputClass + ' mb-3'}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAdjust(null); setAdjustNote('') }}
                      className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={saveCarry}
                      disabled={loading}
                      className="flex-[2] py-2 rounded-lg bg-[#C4865A] hover:bg-[#7A4E2D] disabled:opacity-50 text-white text-sm font-medium"
                    >
                      {loading ? 'กำลังบันทึก...' : 'บันทึกเงินทอน'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Unlock size={18} className="text-green-500" />
            <h2 className="font-semibold text-gray-900">กะกำลังเปิดอยู่</h2>
          </div>
          <p className="text-sm text-gray-500 mb-1">
            เปิดเมื่อ {fmtDate(openShift.opened_at)} โดย {openShift.opener?.name ?? '—'} ·{' '}
            <span
              className={openShift.opening_denominations ? 'underline decoration-dotted underline-offset-2' : undefined}
              title={denomTitle(openShift.opening_denominations)}
            >
              เงินสดตั้งต้น ฿{money(openShift.opening_cash)}
            </span>
            {canEditClosed && !editOpening && (
              <button
                onClick={() => { setEditOpening(true); setOpeningEdit(String(openShift.opening_cash)) }}
                className="ml-1.5 align-middle text-gray-400 hover:text-blue-600"
                title="แก้เงินตั้งต้น (เช่น เช้ามานับในเก๊ะแล้วไม่ตรง)"
              >
                <Pencil size={13} />
              </button>
            )}
          </p>
          {openingVsFloat != null && openingVsFloat !== 0 && (
            <p className="text-xs text-amber-700 font-medium mb-1">
              เงินทอนตั้งต้นที่ตั้งไว้คือ ฿{money(openShift.opening_cash - openingVsFloat)}
              {keptLabels && <> (รวม{keptLabels}ที่มีอยู่แล้ว)</>} — กะนี้เริ่มด้วย ฿{money(openShift.opening_cash)}
            </p>
          )}
          {openingCarry != null && (
            <p className={`text-xs mb-4 ${openingCarry === openShift.opening_cash ? 'text-gray-400' : 'text-amber-700 font-medium'}`}>
              ยกมาจากกะที่แล้ว ฿{money(openingCarry)}
              {openingCarry !== openShift.opening_cash && (
                <> · เช้านี้นับได้{openShift.opening_cash > openingCarry ? 'เกิน' : 'ขาด'} ฿{money(Math.abs(openShift.opening_cash - openingCarry))} — ดูหมายเหตุของกะนี้</>
              )}
            </p>
          )}

          {editOpening && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 space-y-2">
              <p className="text-xs font-medium text-blue-900">แก้เงินสดตั้งต้นของกะนี้</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="number" min="0" step="0.01" autoFocus
                  value={openingEdit}
                  onChange={(e) => setOpeningEdit(e.target.value)}
                  className="w-32 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={openingNote}
                  onChange={(e) => setOpeningNote(e.target.value)}
                  placeholder="เหตุผล เช่น เช้ามานับได้ไม่ตรง"
                  className="flex-1 min-w-40 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={saveOpeningCash} disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg">บันทึก</button>
                <button onClick={() => setEditOpening(false)} className="border border-gray-300 text-gray-600 text-sm px-3 py-1.5 rounded-lg">ยกเลิก</button>
              </div>
              <p className="text-xs text-blue-700">ระบบจะจดไว้ในหมายเหตุว่าใครแก้จากเท่าไหร่เป็นเท่าไหร่</p>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 mb-4 text-sm">
            {loadingSummary ? (
              <p className="text-gray-400">กำลังคำนวณ...</p>
            ) : (
              <>
                {Object.entries(PAYMENT_LABEL).map(([key, label]) =>
                  breakdown[key] ? (
                    <div key={key} className="flex justify-between text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${PAYMENT_DOT[key as PaymentMethod]}`} />
                        ขาย{label}
                      </span>
                      <span>฿{money(breakdown[key])}</span>
                    </div>
                  ) : null
                )}
                {cashFromCancelled > 0 && (
                  <div className="flex justify-between text-gray-500" title="บิลที่ขายในกะนี้แล้วยกเลิกทีหลัง — เงินสดเข้าเก๊ะไปแล้วตอนขาย ถ้าคืนเงินสดไปแล้วจะมีบรรทัดคืนเงินหักกลบด้านล่าง">
                    <span>เงินสดจากบิลที่ยกเลิกภายหลัง ({cancelledBills} ใบ)</span><span>+฿{money(cashFromCancelled)}</span>
                  </div>
                )}
                {cashRefunds > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>คืนเงินสด (ใบเสร็จยกเลิก)</span><span>-฿{money(cashRefunds)}</span>
                  </div>
                )}
                {cashIn > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>เติมเงินเข้าเก๊ะ</span><span>+฿{money(cashIn)}</span>
                  </div>
                )}
                {cashOut > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>หยิบเงินออกจากเก๊ะ</span><span>-฿{money(cashOut)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
                  <span>เงินสดที่ควรมีในลิ้นชัก</span><span>฿{money(expectedCash)}</span>
                </div>
              </>
            )}
          </div>

          {/* เงินเข้า-ออกเก๊ะระหว่างกะ — ไม่ใช่การขาย แต่มีผลกับเงินที่ควรมี */}
          <div className="border border-gray-200 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-gray-600 mb-2">เงินเข้า-ออกเก๊ะระหว่างกะ</p>

            {movements.length > 0 && (
              <ul className="divide-y divide-gray-50 mb-2.5">
                {movements.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                      m.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {m.direction === 'in' ? 'เติมเข้า' : 'หยิบออก'}
                    </span>
                    <span className="font-medium text-gray-900 tabular-nums">
                      {m.direction === 'in' ? '+' : '-'}฿{money(Number(m.amount))}
                    </span>
                    <span className="text-gray-500 truncate flex-1 min-w-0">{m.reason ?? '—'}</span>
                    <span className="text-xs text-gray-400 shrink-0">{fmtTime(m.created_at)}</span>
                    <button
                      onClick={() => removeMovement(m)}
                      className="shrink-0 text-gray-300 hover:text-red-500 text-xs"
                      title="ลบรายการนี้"
                    >
                      ลบ
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-gray-100 rounded-lg p-0.5 shrink-0">
                {([['out', 'หยิบออก'], ['in', 'เติมเข้า']] as const).map(([dir, label]) => (
                  <button
                    key={dir}
                    onClick={() => setMoveDir(dir)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                      moveDir === dir ? (dir === 'in' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white') : 'text-gray-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="number" min="0" step="0.01"
                value={moveAmount}
                onChange={(e) => setMoveAmount(e.target.value)}
                placeholder="จำนวนเงิน"
                className="w-28 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !moveBusy) addMovement() }}
                placeholder={moveDir === 'in' ? 'เช่น เอาเงินทอนมาเติม' : 'เช่น เจ้าของมารับ / จ่ายค่าส่งของ'}
                className="flex-1 min-w-44 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addMovement}
                disabled={moveBusy}
                className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
              >
                บันทึก
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              บันทึกไว้แล้วยอด &ldquo;เงินสดที่ควรมีในลิ้นชัก&rdquo; จะขยับตาม ตอนปิดกะจะได้ไม่ขึ้นว่าขาด/เกินทั้งที่ไม่มีอะไรหาย
            </p>
          </div>

          <label className="block text-xs font-medium text-gray-600 mb-2">นับเงินสดจริง (ใส่จำนวนใบ/เหรียญ)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-3">
            {[BANKNOTES, COINS].map((group, gi) => (
              <div key={gi} className="space-y-1.5">
                {group.map((d) => {
                  const qty = parseInt(counts[d.value] || '0', 10) || 0
                  return (
                    <div key={d.value} className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-[5.5rem] shrink-0">{d.label}</span>
                      <input
                        type="number" min={0} step={1} inputMode="numeric"
                        value={counts[d.value] ?? ''}
                        onChange={(e) => setCounts((c) => ({ ...c, [d.value]: e.target.value }))}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                      <span className={`text-sm text-right flex-1 tabular-nums ${qty > 0 ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                        ฿{money(d.value * qty)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm mb-4">
            <div className="flex justify-between font-bold text-gray-900">
              <span>รวมนับได้</span><span>฿{money(counted)}</span>
            </div>
            {hasCount && (
              channels.swapped > 0 ? (
                // เงินสดขาดเท่าที่บัญชีเกินพอดี — เงินไม่ได้หาย อย่าขึ้นแดงให้พนักงานตกใจเปล่า ๆ
                <p className="text-xs font-medium text-green-600">
                  เงินครบ — แค่ลงช่องทางผิด ฿{money(channels.swapped)}
                  <span className="block font-normal text-gray-500">
                    เงินสด{difference > 0 ? 'เกิน' : 'ขาด'} ฿{money(Math.abs(difference))} ·
                    เข้าบัญชี{bankDiff > 0 ? 'เกิน' : 'ขาด'} ฿{money(Math.abs(bankDiff))} — หักกันแล้วลงตัว
                  </span>
                </p>
              ) : (
                <p className={`text-xs font-medium ${difference === 0 ? 'text-green-600' : difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {difference === 0 ? 'ตรงกับที่ควรมีพอดี' : difference > 0 ? `เกิน ฿${money(difference)}` : `ขาด ฿${money(Math.abs(difference))}`}
                  {bankChecked && !channels.matched && (
                    <span className="block font-normal text-gray-500">
                      รวมกับฝั่งบัญชีแล้วยัง{channels.total > 0 ? 'เกิน' : 'ขาด'} ฿{money(Math.abs(channels.total))}
                    </span>
                  )}
                </p>
              )
            )}
          </div>

          {accounts.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-xs font-medium text-gray-600">เช็คยอดเงินเข้าบัญชี (โอน + QR)</p>
                <p className="text-xs text-gray-500">ในระบบ ฿{money(bankExpected)}</p>
              </div>
              <p className="text-xs text-gray-400 mb-2">
                เปิดแอปดูยอดที่เข้าจริงในช่วงกะนี้แล้วใส่ตรงนี้ — ไม่ใส่ก็ปิดกะได้ตามปกติ
                แต่ใส่แล้วระบบจะแยกออกว่า &ldquo;เงินหาย&rdquo; กับ &ldquo;กดช่องทางผิด&rdquo; คนละเรื่องกัน
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {accounts.map((a) => (
                  <div key={a} className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 flex-1 min-w-0 truncate">{a}</span>
                    <input
                      type="number" min={0} step="0.01" inputMode="decimal"
                      value={transfers[a] ?? ''}
                      onChange={(e) => setTransfers((t) => ({ ...t, [a]: e.target.value }))}
                      className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                ))}
              </div>
              {bankChecked && (
                <p className={`text-xs font-medium mt-2 ${bankDiff === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                  รวมเข้าบัญชีจริง ฿{money(bankActual)}
                  {bankDiff === 0
                    ? ' — ตรงกับที่กดในระบบพอดี'
                    : ` — ${bankDiff > 0 ? 'มากกว่า' : 'น้อยกว่า'}ที่กดในระบบ ฿${money(Math.abs(bankDiff))}`}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mb-1">
            <label className="block text-xs font-medium text-gray-600">เงินทอนที่เหลือไว้ให้พรุ่งนี้</label>
            <div className="flex items-center gap-3">
              {floatTargetDenoms && (
                <button
                  type="button"
                  onClick={applyFloatSet}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  ใช้ชุดที่ตั้งไว้ ฿{money(floatTotal!)}
                </button>
              )}
              {keepEdit && (
                <button
                  type="button"
                  onClick={() => setKeepEdit(null)}
                  className="text-xs font-medium text-gray-400 hover:text-gray-600"
                >
                  คืนค่าที่ระบบคิดให้
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            ใส่ว่าจะเหลือเงินทอนไว้ในเก๊ะชนิดไหนกี่ใบ — ส่วนที่เหลือคือเงินที่ออกไปหาเจ้าของ ไม่ต้องกรอกซ้ำ
            {floatPlan && (
              <span className="block mt-0.5">
                {/* ยอดที่ต้องเหลือไว้จริงคือชุดที่ตั้ง + ชนิดที่เก็บทั้งหมดที่มีในเก๊ะ — กางให้เห็นทั้งสองก้อน
                    ไม่งั้นปุ่มขึ้น ฿4,000 แต่บรรทัดล่างเทียบกับ ฿4,150 แล้วไม่มีใครรู้ว่า ฿150 มาจากไหน */}
                ชุดเงินทอนที่ตั้งไว้ ฿{money(floatTotal!)}
                {floatPlan.kept > 0 && <> + {keptLabels}ที่มี ฿{money(floatPlan.kept)} = ต้องเหลือไว้ ฿{money(floatExpected!)}</>}
                {floatPlan.short > 0 && (
                  <span className="block text-red-600 font-medium">
                    ในเก๊ะมีน้อยกว่าชุดที่ตั้งไว้อยู่ ฿{money(floatPlan.short)} — กดปุ่มข้างบนเพื่อเหลือไว้เท่าชุดที่ตั้ง
                    (ส่วนที่ขาดจะขึ้นเป็น &ldquo;เจ้าของเติม&rdquo; ให้รู้ว่าต้องเอาอะไรมาใส่)
                    หรือจะเหลือไว้ทั้งเก๊ะตามที่นับได้ก็ได้
                  </span>
                )}
                {floatPlan.over > 0 && (
                  <span className="text-amber-600"> · เกินเป้า ฿{money(floatPlan.over)} เพราะเศษนี้เป็นเหรียญ หยิบออกไม่ได้</span>
                )}
              </span>
            )}
          </p>

          {/* แบงค์คอลัมน์ซ้าย เหรียญคอลัมน์ขวา — เรียงให้ตรงกับช่องนับเงินข้างบนเป๊ะ ๆ
              เดิมไล่ DENOMS ลงในกริดตรง ๆ กริดเลยวางทีละแถว ได้ "แบงค์ยี่สิบ | เหรียญสิบ"
              คู่กันอยู่บรรทัดเดียว คนกรอกต้องไล่สายตาข้ามไปมาระหว่างสองกล่องที่ลำดับไม่ตรงกัน */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-3">
            {[BANKNOTES, COINS].map((group, gi) => (
              <div key={gi} className="space-y-1.5">
                {group.map((d) => {
                  const keep = keepCounts[d.value]
                  const diff = (countedDenoms[d.value] ?? 0) - keep
                  const want = floatTargetDenoms?.[d.value] ?? 0
                  const lacking = want > keep && !keepAll.includes(d.value)
                  return (
                    <div key={d.value} className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-[5.5rem] shrink-0">{d.label}</span>
                      <input
                        type="number" min={0} step={1} inputMode="numeric"
                        value={keepValue(d.value)}
                        onChange={(e) => editKeep(d.value, e.target.value)}
                        className={`w-16 border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 ${
                          lacking ? 'border-red-300 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500'
                        }`}
                        placeholder="0"
                      />
                      <span className="text-xs flex-1 tabular-nums">
                        {diff > 0 && <span className="text-gray-500">ให้เจ้าของ {diff}</span>}
                        {diff < 0 && <span className="text-blue-600 font-medium">เจ้าของเติม {-diff}</span>}
                        {lacking && <span className="text-red-500 font-medium">{diff !== 0 ? ' · ' : ''}ต้องการ {want}</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {floatPlan && floatPlan.shortages.length > 0 && (
            <p className="text-xs font-medium text-red-600 mb-3">
              ต้องแลกมาเติมก่อนเปิดร้าน:{' '}
              {floatPlan.shortages.map((sh) => {
                const label = DENOMS.find((d) => d.value === sh.value)?.label ?? sh.value
                return `${label} อีก ${sh.need}`
              }).join(' · ')}
            </p>
          )}

          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
            <div className={`flex justify-between ${cashToOwner < 0 ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
              <span>{cashToOwner < 0 ? 'เจ้าของเติมเข้าเก๊ะ' : 'ให้เจ้าของ'}</span>
              <span>{cashToOwner === 0 ? '—' : cashToOwner > 0 ? `-฿${money(cashToOwner)}` : `+฿${money(-cashToOwner)}`}</span>
            </div>
            <div className="flex justify-between font-medium text-gray-900 pt-1 border-t border-gray-200">
              <span>เหลือในลิ้นชัก (เงินตั้งต้นกะถัดไป)</span><span>฿{money(leftover)}</span>
            </div>
            {floatGap != null && hasCount && (
              <p className={`text-xs font-medium ${floatGap === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                {floatGap === 0
                  ? `ตรงเงินทอนตั้งต้น ฿${money(floatExpected!)} พอดี`
                  : `${floatGap > 0 ? 'เกิน' : 'ขาด'}เงินทอนตั้งต้น ฿${money(floatExpected!)} อยู่ ฿${money(Math.abs(floatGap))}`}
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 mt-3 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={reopenNext}
              onChange={(e) => setReopenNext(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            เปิดกะใหม่ต่อเลยด้วยเงินคงเหลือ ฿{money(leftover)}
          </label>
          <p className="ml-6 text-xs text-gray-400">
            ไม่ติ๊ก = ปิดกะแล้วจบ เช้ามาค่อยกดเปิดกะใหม่
          </p>

          <label className="block text-xs font-medium text-gray-600 mb-1 mt-3">หมายเหตุ (ถ้ามี)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
            placeholder="เช่น เหตุผลที่เงินขาด/เกิน"
          />


          {/* สรุปทั้งกะในกล่องเดียว — ถ่ายรูปกล่องนี้ส่งกลุ่มไลน์ได้เลย
              เดิมต้องถ่ายสองรูป (หน้าสรุปรายวันเอายอดแยกช่องทาง + หน้านี้เอายอดเงินในเก๊ะ)
              แล้วคนในกลุ่มต้องเอามาต่อกันเอง ตกรูปไหนไปก็ดูไม่ออกว่าวันนั้นขายได้เท่าไหร่ */}
          <div className="mt-4 rounded-lg border-2 border-gray-200 p-3.5 text-sm">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <p className="font-semibold text-gray-900">สรุปกะนี้</p>
              <div className="flex items-baseline gap-3">
                <p className="text-xs text-gray-400">ถ่ายรูปกล่องนี้ส่งกลุ่มได้เลย</p>
                <button
                  type="button"
                  onClick={printSummary}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 shrink-0"
                  title="เปิดกล่องพิมพ์ — เลือก &ldquo;บันทึกเป็น PDF&rdquo; ก็ได้ใบสรุปหน้าเดียวไว้ส่งกลุ่ม"
                >
                  <Printer size={13} /> พิมพ์ / PDF
                </button>
              </div>
            </div>

            <div className="flex justify-between font-semibold text-gray-900">
              <span>ขายหน้าร้าน</span>
              <span className="tabular-nums">
                ฿{money(salesTotal)} <span className="text-xs font-normal text-gray-400">({billCount} บิล)</span>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1.5">
              {Object.entries(PAYMENT_LABEL).map(([key, label]) => (
                <div key={key} className={`flex justify-between ${breakdown[key] ? 'text-gray-700' : 'text-gray-300'}`}>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${breakdown[key] ? PAYMENT_DOT[key as PaymentMethod] : 'bg-gray-200'}`} />
                    {label}
                    {methodBills[key] ? <span className="text-xs text-gray-400">({methodBills[key]} บิล)</span> : null}
                  </span>
                  <span className="tabular-nums">฿{money(breakdown[key] ?? 0)}</span>
                </div>
              ))}
            </div>
            {otherChannels.length > 0 && (
              <p className="text-xs text-gray-500 mt-1.5">
                ช่องทางอื่นในช่วงกะนี้ (ไม่เข้าเก๊ะ):{' '}
                {otherChannels.map((c) => `${c.label} ฿${money(c.amount)} (${c.count} บิล)`).join(' · ')}
              </p>
            )}

            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>เงินสดที่ควรมีในลิ้นชัก</span><span className="tabular-nums">฿{money(expectedCash)}</span>
              </div>
              <div className="flex justify-between font-medium text-gray-900">
                <span>นับได้จริง</span><span className="tabular-nums">฿{money(counted)}</span>
              </div>
              {bankChecked && (
                <div className="flex justify-between text-gray-600">
                  <span>เข้าบัญชีจริง (โอน + QR)</span>
                  <span className="tabular-nums">
                    ฿{money(bankActual)} <span className="text-xs text-gray-400">/ ในระบบ ฿{money(bankExpected)}</span>
                  </span>
                </div>
              )}
              <p className={`text-sm font-semibold ${
                !hasCount ? 'text-gray-400' : channels.swapped > 0 || channels.matched ? 'text-green-600' : channels.total > 0 ? 'text-blue-600' : 'text-red-600'
              }`}>
                {!hasCount
                  ? 'ยังไม่ได้นับเงิน'
                  : channels.swapped > 0
                    ? `เงินครบ — แต่ลงช่องทางผิด ฿${money(channels.swapped)}`
                    : channels.matched
                      ? 'เงินตรงพอดี'
                      : `เงิน${channels.total > 0 ? 'เกิน' : 'ขาด'} ฿${money(Math.abs(channels.total))}${bankChecked ? ' (รวมเก๊ะ + บัญชี)' : ''}`}
              </p>
            </div>

            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>{cashToOwner < 0 ? 'เจ้าของเติมเข้าเก๊ะ' : 'ให้เจ้าของ'}</span>
                <span className="tabular-nums">{cashToOwner === 0 ? '—' : `฿${money(Math.abs(cashToOwner))}`}</span>
              </div>
              <div className="flex justify-between font-medium text-gray-900">
                <span>เหลือเป็นเงินทอนพรุ่งนี้</span><span className="tabular-nums">฿{money(leftover)}</span>
              </div>
            </div>
          </div>

          {/* ใบสรุปสำหรับพิมพ์ / เซฟเป็น PDF — บนจอซ่อนไว้ โผล่เฉพาะตอนสั่งพิมพ์ (ดู globals.css)
              จงใจให้พิมพ์ได้ "ก่อน" ปิดกะ: นับพลาดก็แก้เลขแล้วพิมพ์ใหม่ได้ ไม่ต้องไปแก้กะที่ปิดไปแล้ว */}
          <div id="shift-print" className="hidden print:block text-[12px] leading-snug text-black">
            <div className="flex items-end justify-between border-b border-black pb-1">
              <div>
                <p className="text-[16px] font-bold">{storeName || 'สรุปปิดกะ'}</p>
                <p className="text-[11px]">ใบสรุปปิดกะ · พิมพ์เมื่อ {printedAt}</p>
              </div>
              <p className="text-[11px] text-right">
                เปิดกะ {fmtDate(openShift.opened_at)}<br />
                โดย {openShift.opener?.name ?? '—'} · ปิดโดย {currentUserName || '—'}
              </p>
            </div>

            <table className="w-full mt-2">
              <tbody>
                <tr><td className="font-bold pt-1" colSpan={2}>ยอดขายหน้าร้าน {billCount} บิล</td></tr>
                {Object.entries(PAYMENT_LABEL).map(([key, label]) =>
                  breakdown[key] ? (
                    <tr key={key}>
                      <td className="pl-3">{label} ({methodBills[key] ?? 0} บิล)</td>
                      <td className="text-right tabular-nums">฿{money(breakdown[key])}</td>
                    </tr>
                  ) : null,
                )}
                <tr className="border-b border-gray-400">
                  <td className="font-medium">รวมขายหน้าร้าน</td>
                  <td className="text-right font-medium tabular-nums">฿{money(salesTotal)}</td>
                </tr>
                {otherChannels.map((c) => (
                  <tr key={c.label}>
                    <td className="pl-3">{c.label} ({c.count} บิล) — ไม่เข้าเก๊ะ</td>
                    <td className="text-right tabular-nums">฿{money(c.amount)}</td>
                  </tr>
                ))}

                <tr><td className="font-bold pt-2" colSpan={2}>เงินสดในลิ้นชัก</td></tr>
                <tr><td className="pl-3">เงินตั้งต้นเช้านี้</td><td className="text-right tabular-nums">฿{money(openShift.opening_cash)}</td></tr>
                {cashIn > 0 && <tr><td className="pl-3">เติมเงินเข้าเก๊ะ</td><td className="text-right tabular-nums">+฿{money(cashIn)}</td></tr>}
                {cashOut > 0 && <tr><td className="pl-3">หยิบเงินออกจากเก๊ะ</td><td className="text-right tabular-nums">-฿{money(cashOut)}</td></tr>}
                {cashRefunds > 0 && <tr><td className="pl-3">คืนเงินสด (บิลยกเลิก)</td><td className="text-right tabular-nums">-฿{money(cashRefunds)}</td></tr>}
                <tr><td className="font-medium">เงินสดที่ควรมี</td><td className="text-right font-medium tabular-nums">฿{money(expectedCash)}</td></tr>
                <tr className="border-b border-gray-400">
                  <td className="font-medium">นับได้จริง</td>
                  <td className="text-right font-bold tabular-nums">฿{money(counted)}</td>
                </tr>
                {bankChecked && (
                  <tr className="border-b border-gray-400">
                    <td>เข้าบัญชีจริง (โอน + QR) · ในระบบ ฿{money(bankExpected)}</td>
                    <td className="text-right tabular-nums">฿{money(bankActual)}</td>
                  </tr>
                )}
                <tr>
                  <td className="font-bold pt-1" colSpan={2}>
                    {!hasCount
                      ? 'ยังไม่ได้นับเงิน'
                      : channels.swapped > 0
                        ? `ผลต่าง: เงินครบ — แต่ลงช่องทางผิด ฿${money(channels.swapped)}`
                        : channels.matched
                          ? 'ผลต่าง: เงินตรงพอดี'
                          : `ผลต่าง: เงิน${channels.total > 0 ? 'เกิน' : 'ขาด'} ฿${money(Math.abs(channels.total))}${bankChecked ? ' (รวมเก๊ะ + บัญชี)' : ''}`}
                  </td>
                </tr>

                <tr><td className="font-bold pt-2" colSpan={2}>ส่งต่อ</td></tr>
                <tr>
                  <td className="pl-3">{cashToOwner < 0 ? 'เจ้าของเติมเข้าเก๊ะ' : 'ให้เจ้าของ'}</td>
                  <td className="text-right tabular-nums">{cashToOwner === 0 ? '—' : `฿${money(Math.abs(cashToOwner))}`}</td>
                </tr>
                <tr>
                  <td className="pl-3 font-medium">เหลือเป็นเงินทอนพรุ่งนี้</td>
                  <td className="text-right font-bold tabular-nums">฿{money(leftover)}</td>
                </tr>
              </tbody>
            </table>

            <p className="mt-2 text-[11px]"><span className="font-medium">นับได้:</span> {denomLine(countedDenoms) || '—'}</p>
            <p className="text-[11px]"><span className="font-medium">เหลือไว้:</span> {denomLine(keepCounts) || '—'}</p>
            {notes.trim() && <p className="mt-1 text-[11px]"><span className="font-medium">หมายเหตุ:</span> {notes.trim()}</p>}

            <div className="mt-6 flex justify-between text-[11px]">
              <span>ผู้ปิดกะ ______________________</span>
              <span>ผู้รับเงิน ______________________</span>
            </div>
            <p className="mt-2 text-[10px] text-gray-500">
              ใบนี้พิมพ์จากตัวเลขบนหน้าจอตอน {printedAt} — ยังไม่ได้กดปิดกะ ถ้านับใหม่แล้วไม่ตรง แก้แล้วพิมพ์ใหม่ได้เลย
            </p>
          </div>

          <button
            onClick={closeShift}
            disabled={loading}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Lock size={15} /> {loading ? 'กำลังปิดกะ...' : 'ปิดกะ'}
          </button>
        </div>
      )}

      <h2 className="font-semibold text-gray-900 mb-3">ประวัติกะที่ผ่านมา</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 whitespace-nowrap">เปิด - ปิด</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">โดย</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">เงินตั้งต้น</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">คาดว่ามี</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">นับได้จริง</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ให้เจ้าของ</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ผลต่าง</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {history.map((s, i) => {
              // history เรียงใหม่→เก่า แถวถัดไปคือกะก่อนหน้า = ต้นทางของเงินที่ยกมา
              const carry = carryOf(history[i + 1])
              const carryDiff = carry == null ? null : s.opening_cash - carry
              return (
              <Fragment key={s.id}>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                  {fmtDate(s.opened_at)} - {s.closed_at ? fmtDate(s.closed_at) : '—'}
                  {s.notes && (
                    <button
                      onClick={() => setOpenNote(openNote === s.id ? null : s.id)}
                      title="ดูหมายเหตุของกะนี้"
                      className={`ml-1.5 align-middle ${openNote === s.id ? 'text-blue-600' : 'text-gray-300 hover:text-blue-600'}`}
                    >
                      <StickyNote size={14} />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {s.opener?.name ?? '—'} / {s.closer?.name ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700" title={denomTitle(s.opening_denominations)}>
                  ฿{money(s.opening_cash)}
                  {carryDiff != null && carryDiff !== 0 && (
                    <span
                      className="block text-xs font-medium text-amber-600"
                      title={`กะก่อนหน้าส่งต่อมา ฿${money(carry!)} แต่กะนี้ตั้งต้น ฿${money(s.opening_cash)}`}
                    >
                      {carryDiff > 0 ? '+' : '−'}฿{money(Math.abs(carryDiff))} จากยกมา
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{s.expected_cash != null ? `฿${money(s.expected_cash)}` : '—'}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700" title={denomTitle(s.closing_denominations)}>
                  {s.closing_cash_counted != null ? `฿${money(s.closing_cash_counted)}` : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700" title={denomTitle(s.owner_denominations)}>
                  {s.cash_to_owner == null || s.cash_to_owner === 0
                    ? '—'
                    : s.cash_to_owner > 0
                      ? `฿${money(s.cash_to_owner)}`
                      : <span className="text-blue-600">+฿{money(-Number(s.cash_to_owner))}</span>}
                </td>
                <td className={`px-4 py-3 text-sm text-right font-semibold ${
                  s.cash_difference == null ? 'text-gray-400' : s.cash_difference === 0 ? 'text-green-600' : s.cash_difference > 0 ? 'text-blue-600' : 'text-red-600'
                }`}>
                  {s.cash_difference != null ? `${s.cash_difference > 0 ? '+' : ''}฿${money(s.cash_difference)}` : '—'}
                </td>
                {canEditClosed && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => startEdit(s)}
                      title="แก้ไขยอดที่นับได้"
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                    >
                      <Pencil size={15} />
                    </button>
                  </td>
                )}
              </tr>
              {openNote === s.id && s.notes && (
                <tr className="bg-amber-50/60">
                  <td colSpan={canEditClosed ? 8 : 7} className="px-4 py-3 text-xs text-gray-700 whitespace-pre-line">
                    {s.notes}
                  </td>
                </tr>
              )}
              </Fragment>
              )
            })}
            {history.length === 0 && (
              <tr>
                <td colSpan={canEditClosed ? 8 : 7} className="px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีประวัติกะ</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* แก้ยอดกะที่ปิดไปแล้ว (เจ้าของร้านเท่านั้น) */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null) }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
            <h2 className="font-semibold text-gray-900">แก้ไขยอดปิดกะ</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              กะ {fmtDate(editing.opened_at)}
              {editing.closed_at ? ` - ${fmtDate(editing.closed_at)}` : ''}
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm text-gray-600">
                <span>เงินตั้งต้น</span>
                <span>฿{money(editing.opening_cash)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>เงินสดที่ควรมี</span>
                <span>฿{money(Number(editing.expected_cash ?? 0))}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ยอดที่นับได้จริง (บาท)</label>
                <input
                  type="number" min="0" step="0.01" autoFocus
                  value={editCounted}
                  onChange={(e) => setEditCounted(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เงินที่ให้เจ้าของ (บาท) <span className="font-normal text-gray-400">· ติดลบ = เจ้าของเติมเข้าเก๊ะ</span>
                </label>
                <input
                  type="number" step="0.01"
                  value={editOwner}
                  onChange={(e) => setEditOwner(e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผลที่แก้ (ไม่ใส่ก็ได้)</label>
                <input
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className={inputClass}
                  placeholder="เช่น นับเหรียญตกไป 1 ถุง"
                />
              </div>

              {editCounted !== '' && !Number.isNaN(parseFloat(editCounted)) && (
                <p className="text-sm text-gray-600">
                  ผลต่างใหม่:{' '}
                  <span className={`font-semibold ${
                    parseFloat(editCounted) - Number(editing.expected_cash ?? 0) === 0
                      ? 'text-green-600'
                      : parseFloat(editCounted) - Number(editing.expected_cash ?? 0) > 0
                        ? 'text-blue-600'
                        : 'text-red-600'
                  }`}>
                    {parseFloat(editCounted) - Number(editing.expected_cash ?? 0) > 0 ? '+' : ''}
                    ฿{money(parseFloat(editCounted) - Number(editing.expected_cash ?? 0))}
                  </span>
                </p>
              )}

              <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                ระบบจะบันทึกไว้ในหมายเหตุว่าใครแก้ ตอนไหน จากยอดเท่าไหร่ — และรายละเอียดจำนวนใบ/เหรียญที่นับไว้เดิมจะถูกล้าง เพราะไม่ตรงกับยอดใหม่แล้ว
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
              >
                {loading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOpenShift && (
        <OpenShiftModal
          userId={currentUserId}
          userName={currentUserName}
          onClose={() => setShowOpenShift(false)}
          onOpened={() => { setShowOpenShift(false); router.refresh() }}
        />
      )}
    </div>
  )
}
