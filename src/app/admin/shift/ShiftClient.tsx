'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { checkChannels, expectedCash as computeExpectedCash, splitShiftBills, type ShiftBill } from '@/lib/shiftCash'
import { BANKNOTES, COINS, DENOMS, planFloat } from '@/lib/shiftFloat'
import { DEFAULT_TRANSFER_ACCOUNTS, PAYMENT_DOT, PAYMENT_LABEL, sumBankMethods } from '@/lib/payments'
import { CHANNEL_GROUPS } from '@/lib/salesChannel'
import type { PaymentMethod, SalesChannel } from '@/lib/types'
import { Wallet, Lock, Unlock, Pencil, StickyNote, ArrowRightLeft, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/lib/confirm'
import OpenShiftModal from '@/components/OpenShiftModal'
import { findOrphanSales, type OrphanSales } from '@/lib/shiftOpen'
import { loadShiftDraft, saveShiftDraft } from '@/lib/shiftDraft'
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
  // เงินทอนที่จะเหลือไว้ให้กะถัดไป (ยอดรวม) · null = ยังไม่แตะ ใช้ยอดที่ตั้งไว้ + แบงค์ห้าสิบที่คาเก๊ะ
  const [keepEdit, setKeepEdit] = useState<string | null>(null)
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
  // เวลาที่ดึงยอดขายของกะมา — ตัวเลขบนหน้านี้ (และใบนับที่คนกรอก) อธิบายกะ "ถึงเวลานี้"
  // บิลที่เข้ามาหลังจากนี้คือลูกค้าที่มาเพิ่มตอนกำลังนับเงิน ตอนกดปิดกะต้องถามก่อน (ดู closeShift)
  const [loadedAt, setLoadedAt] = useState('')
  // สั่งดึงยอดใหม่โดยไม่ reload หน้า — ใบนับที่กรอกค้างอยู่ต้องไม่หาย
  const [reloadKey, setReloadKey] = useState(0)
  const [breakdown, setBreakdown] = useState<Record<string, number>>({})
  const [methodBills, setMethodBills] = useState<Record<string, number>>({})
  const [salesTotal, setSalesTotal] = useState(0)
  const [billCount, setBillCount] = useState(0)
  // ยอดขายช่องทางอื่นในช่วงกะเดียวกัน (บูธ/ออนไลน์) — ไม่เข้าเก๊ะ แต่กลุ่มไลน์อยากเห็นในรูปเดียวกัน
  const [otherChannels, setOtherChannels] = useState<{ label: string; amount: number; count: number }[]>([])
  // ยอดที่เช็คได้จากแอปธนาคารตอนปิดกะ แยกตามบัญชี — ว่างหมด = ยังไม่ได้เช็ค ไม่เตือนอะไร
  const [transfers, setTransfers] = useState<Record<string, string>>({})
  // ร่างใบนับ (ดู lib/shiftDraft) — draftFor = กะที่อ่านร่างมาแล้ว เขียนทับได้ตั้งแต่ตอนนั้น
  // เขียนก่อนอ่านจะเอาช่องว่างไปทับร่างที่ค้างไว้
  const [draftFor, setDraftFor] = useState<string | null>(null)
  const [restoredAt, setRestoredAt] = useState('')
  const [baseCash, setBaseCash] = useState<number | null>(null)
  const [baseBank, setBaseBank] = useState<number | null>(null)
  // เวลาที่พิมพ์ใบสรุป — ตั้งตอนกดพิมพ์เท่านั้น (คิดตอน render จะได้ HTML ฝั่ง server ไม่ตรงกับ client)
  const [printedAt, setPrintedAt] = useState('')
  const [cashRefunds, setCashRefunds] = useState(0)
  // เงินสดที่จ่ายคืนจากใบคืน/เปลี่ยนสินค้าในกะนี้ (ดู src/lib/returns.ts)
  const [cashReturnRefunds, setCashReturnRefunds] = useState(0)
  // เงินสดจากบิลในกะนี้ที่ถูกยกเลิกทีหลัง — รับไว้แล้วตอนขาย ต้องนับเป็นเงินเข้าเก๊ะ (ดู lib/shiftCash)
  const [cashFromCancelled, setCashFromCancelled] = useState(0)
  const [cancelledBills, setCancelledBills] = useState(0)
  // เงินเข้า-ออกเก๊ะระหว่างกะ (เจ้าของมารับ / เอาเงินทอนมาเติม / จ่ายค่าส่งของ)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [moveDir, setMoveDir] = useState<'in' | 'out'>('out')
  const [moveAmount, setMoveAmount] = useState('')
  const [moveReason, setMoveReason] = useState('')
  const [moveBusy, setMoveBusy] = useState(false)
  // บิลที่ขายไปตอนไม่มีกะเปิด (ลูกค้ามาเพิ่มหลังปิดกะเมื่อคืน) — โชว์ในการ์ด "เปิดกะใหม่"
  // ให้คนที่มาเปิดกะเช้ารู้ก่อนว่าต้องเจออะไร ไม่ต้องกดเข้าโมดอลก่อนถึงจะเห็น
  const [pendingSales, setPendingSales] = useState<OrphanSales | null>(null)
  // แก้เงินตั้งต้นของกะที่เปิดอยู่ (เจ้าของเท่านั้น)
  const [editOpening, setEditOpening] = useState(false)
  const [openingEdit, setOpeningEdit] = useState('')
  const [openingNote, setOpeningNote] = useState('')

  useEffect(() => {
    // มีกะเปิดอยู่ = ไม่มีบิลค้างนอกกะให้โชว์ (การ์ดนี้ขึ้นเฉพาะตอนไม่มีกะเปิด)
    if (openShift) return
    let cancelled = false
    // เงินเข้า-ออกเก๊ะที่ลงไว้ตอนไม่มีกะ (shift_id ว่าง) — ตัดที่เวลาปิดกะล่าสุดเหมือน findOrphanSales
    // ของเก่ากว่านั้นเคยถูกคิดเป็นเงินตั้งต้นของกะที่ผ่านมาแล้ว เอามาโชว์ซ้ำจะเข้าใจผิดว่ายังค้าง
    const since = history.find((h) => h.closed_at)?.closed_at
    const loadPending = createClient()
      .from('cash_movements')
      .select('*, profiles(name)')
      .is('shift_id', null)
      .order('created_at')
    Promise.all([
      findOrphanSales(),
      since ? loadPending.gte('created_at', since) : loadPending,
    ]).then(([found, { data: moves }]) => {
      if (cancelled) return
      setPendingSales(found)
      setMovements((moves as unknown as CashMovement[]) ?? [])
    })
    return () => { cancelled = true }
  }, [openShift, reloadKey, history])

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
      // จดเวลา "ก่อน" ยิง query — บิลที่เกิดระหว่าง query อาจติดมาในชุดนี้แล้ว ถือเป็นบิลใหม่ไว้ก่อน
      // ดีกว่าถือว่าเก่าแล้วปิดกะทับเงียบ ๆ (ถามเกินแล้วกดอัปเดตยอดได้ ไม่ถามแล้วยอดผิดแก้ไม่ได้)
      const startedAt = new Date().toISOString()
      const [{ data: sold }, { data: refunds }, { data: moves }, { data: returnRefunds }] = await Promise.all([
        // ดึงทุกช่องทางมา แล้วคัดเฉพาะ 'store' ไปคิดเงินในเก๊ะ — ที่เหลือโชว์เป็นบรรทัดข้อมูลในสรุป
        // ยอดขายที่บูธไม่เข้าเก๊ะที่ร้าน — คนที่ไปงานถือเงินทอนแยกไปต่างหาก (ดูสรุปที่ /admin/booth)
        // ขายผ่านแพลตฟอร์ม (Shopee/TikTok/Lazada) ก็ไม่ใช่เงินที่รับหน้าร้าน แพลตฟอร์มหักค่าธรรมเนียมแล้วโอนทีหลัง
        // ไม่กรอง status — บิลที่ยกเลิกทีหลังก็เคยรับเงินสดเข้าเก๊ะตอนขาย ต้องเอามาคิดด้วย
        supabase.from('transactions').select('status, total, payment_method, sales_channel, transaction_payments(method, amount)').gte('created_at', shift.opened_at),
        // คืนเงินสดจากบิลที่ยกเลิก — เฉพาะบิลหน้าร้าน เงินที่คืนบิลบูธ/แพลตฟอร์มไม่ได้ออกจากเก๊ะนี้
        // (lib/shiftOpen กรองช่องทางไว้แล้ว ตรงนี้เคยลืม ทำให้สองหน้าคิดยอดไม่เท่ากัน)
        supabase.from('transactions').select('total').eq('status', 'cancelled').eq('refund_method', 'cash').eq('sales_channel', 'store').gte('cancelled_at', shift.opened_at),
        supabase.from('cash_movements').select('*, profiles(name)').eq('shift_id', shift.id).order('created_at'),
        // ใบคืนที่จ่ายเงินสดคืนลูกค้าในกะนี้ — เงินออกจากเก๊ะจริง ต้องหักออกเหมือนคืนเงินบิลยกเลิก
        // (ส่วนที่หักกับบิลใหม่ไม่ใช่เงินสด และยอดที่เก็บเพิ่มเข้าทาง cashSales ของบิลใหม่เอง)
        supabase
          .from('returns')
          .select('refund_amount')
          .eq('refund_method', 'cash')
          .gt('refund_amount', 0)
          .gte('created_at', shift.opened_at),
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
      setCashReturnRefunds((returnRefunds ?? []).reduce((s, r) => s + Number(r.refund_amount), 0))
      setLoadedAt(startedAt)
      setLoadingSummary(false)
    }

    loadSummary(openShift)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openShift?.id, reloadKey])

  const shiftId = openShift?.id ?? null
  useEffect(() => {
    if (!shiftId) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      const d = loadShiftDraft(shiftId)
      if (d) {
        setCounts(d.counts)
        setTransfers(d.transfers)
        setKeepEdit(d.keepEdit)
        setNotes(d.notes)
      }
      setBaseCash(d?.baseCash ?? null)
      setBaseBank(d?.baseBank ?? null)
      setRestoredAt(d?.savedAt ?? '')
      setDraftFor(shiftId)
    })
    return () => { cancelled = true }
  }, [shiftId])

  useEffect(() => {
    if (!shiftId || draftFor !== shiftId) return
    saveShiftDraft({ shiftId, counts, transfers, keepEdit, notes, baseCash, baseBank })
  }, [shiftId, draftFor, counts, transfers, keepEdit, notes, baseCash, baseBank])

  async function clearDraft() {
    if (!(await confirmDialog({ message: 'ล้างใบนับที่กรอกไว้ทั้งหมดแล้วเริ่มนับใหม่?' })).confirmed) return
    setCounts({})
    setTransfers({})
    setKeepEdit(null)
    setNotes('')
    setBaseCash(null)
    setBaseBank(null)
    setRestoredAt('')
  }

  const cashSales = breakdown.cash ?? 0
  const cashIn = movements.filter((m) => m.direction === 'in').reduce((s, m) => s + Number(m.amount), 0)
  const cashOut = movements.filter((m) => m.direction === 'out').reduce((s, m) => s + Number(m.amount), 0)
  // เงินที่ควรมีในลิ้นชัก = ตั้งต้น + ขายเงินสด + เงินสดจากบิลที่ยกเลิกทีหลัง − คืนเงินสด + เติมเข้า − หยิบออก
  const expectedCash = openShift
    ? computeExpectedCash({
        openingCash: openShift.opening_cash,
        cashSales, cashFromCancelled, cashRefunds, cashReturnRefunds, cashIn, cashOut,
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
  // เงินที่ขยับหลังนับค้างไว้ — นับตรงอยู่แล้ว (รวมก้อนนั้นไปแล้ว) ไม่ต้องเตือน
  const movedCash = !loadingSummary && hasCount && baseCash != null && Math.abs(difference) >= 0.005
    ? expectedCash - baseCash : 0
  const movedBank = !loadingSummary && bankChecked && baseBank != null && Math.abs(bankDiff) >= 0.005
    ? bankExpected - baseBank : 0
  const hasMoved = Math.abs(movedCash) >= 0.005 || Math.abs(movedBank) >= 0.005
  const countedDenoms: Record<number, number> = Object.fromEntries(
    DENOMS.map((d) => [d.value, qtyOf(counts, d.value)]),
  )
  // เงินทอนคุมด้วยยอดรวมอย่างเดียว — รวบของเก่าออกทั้งเก๊ะ แล้ววางชุด ฿4,000 ที่เจ้าของเตรียมไว้
  // ชุดแต่ละคืนแบงค์/เหรียญไม่เหมือนกัน จึงไม่บันทึกและไม่เทียบรายชนิด (ดู lib/shiftFloat)
  const keepAll = floatKeep ?? []
  const keptLabels = DENOMS.filter((d) => keepAll.includes(d.value)).map((d) => d.label).join('/')
  const floatPlan = hasCount && floatTarget != null ? planFloat(countedDenoms, floatTarget, keepAll) : null
  const keepDefault = floatPlan ? floatPlan.leftover : counted
  const leftover = keepEdit == null ? keepDefault : parseFloat(keepEdit || '0') || 0
  const swapPlan = floatPlan && leftover === floatPlan.leftover ? floatPlan : null
  // ให้เจ้าของ = ที่นับได้ − ที่เหลือไว้ · ติดลบ = เจ้าของวางลงมากกว่าที่รวบออกได้
  const cashToOwner = counted - leftover
  const denomLine = (c: Record<number, number>) =>
    DENOMS.filter((d) => c[d.value]).map((d) => `${d.label.replace(/^(แบงค์|เหรียญ)/, '')} ${c[d.value]}`).join(' · ')

  /**
   * บันทึกเงินเข้า-ออกเก๊ะ — ลงได้ทั้งตอนมีกะเปิดและตอนไม่มี
   *
   * ตอนไม่มีกะเปิด `shift_id` เป็น null ไว้ก่อน แล้วตอนเปิดกะเช้าถัดไปจะถูกผูกเข้ากะนั้นพร้อมหัก
   * ออกจากยอดตั้งต้นให้ (ดู lib/shiftOpen) — เดิมคอลัมน์นี้เป็น NOT NULL พนักงานที่หยิบเงินไป
   * ซื้อของตอนปิดร้านจึงไม่มีช่องให้ลง เงินก้อนนั้นโผล่เป็น "เงินขาด" เช้าวันรุ่งขึ้นแทน
   */
  async function addMovement() {
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
        shift_id: openShift?.id ?? null,
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
    toast.success(
      openShift
        ? moveDir === 'in' ? 'บันทึกเงินเข้าเก๊ะแล้ว' : 'บันทึกเงินออกจากเก๊ะแล้ว'
        : 'บันทึกไว้แล้ว — เช้าเปิดกะระบบจะหักให้เอง',
    )
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

  /**
   * ลูกค้ามาเพิ่มตอนกำลังนับเงิน — เช็กก่อนบันทึกว่ามีบิลเข้ามาหลังหน้านี้ดึงยอดไหม
   *
   * หน้านี้ดึงยอดขายครั้งเดียวตอนเปิดหน้า (ไม่ได้ poll — ตัวเลขต้องนิ่งระหว่างนับ ไม่ใช่ขยับเองกลางนับ)
   * บิลที่เข้ามาหลังจากนั้นจึงไม่อยู่ใน "เงินที่ควรมีในลิ้นชัก" ที่ใช้คิดขาด/เกิน ปิดทับไปเลยจะได้
   * `expected_cash`/`cash_difference` ผิด แล้วเจ้าของเห็นยอดขาด/เกินปลอม ๆ ใน Telegram
   *
   * คืน:
   *  - `null` = ไม่มีอะไรเปลี่ยน ปิดได้ตามปกติ
   *  - `{ stale: true }` = ยอดเปลี่ยนด้วยเหตุที่เลื่อนไปกะหน้าไม่ได้ (บิลคีย์ย้อนหลัง/ยกเลิกบิลเก่า)
   *    ต้องดึงยอดใหม่แล้วนับใหม่
   *  - `{ newer }` = เป็นบิลที่เข้ามาหลังนับเงินล้วน ๆ → เสนอ "ปิดกะที่เวลาก่อนบิลนั้น" แล้วยกไปกะหน้า
   */
  async function findBillsAfterCount(shift: ShiftRow) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('transactions')
      .select('created_at, status, total, payment_method, sales_channel, transaction_payments(method, amount)')
      .gte('created_at', shift.opened_at)
      .order('created_at')
    if (error || !data) return null
    const store = (data as unknown as (ShiftBill & { created_at: string; sales_channel: SalesChannel })[])
      .filter((b) => b.sales_channel === 'store')
    const same = (a: ReturnType<typeof splitShiftBills>) =>
      Math.abs((a.byMethod.cash ?? 0) - cashSales) < 0.005 &&
      Math.abs(a.cashFromCancelled - cashFromCancelled) < 0.005 &&
      Math.abs(a.salesTotal - salesTotal) < 0.005 &&
      a.bills === billCount
    if (same(splitShiftBills(store))) return null
    const newer = loadedAt ? store.filter((b) => b.created_at > loadedAt) : []
    // ตัดบิลใหม่ออกแล้วยอดกลับมาตรงกับที่นับไว้ = ส่วนที่เปลี่ยนมาจากบิลใหม่ล้วน ๆ
    if (newer.length === 0 || !same(splitShiftBills(store.filter((b) => b.created_at <= loadedAt)))) {
      return { stale: true as const }
    }
    const cutoff = new Date(new Date(newer[0].created_at).getTime() - 1000)
    // ตัดก่อนบิลแรกต้องยังอยู่หลังเวลาเปิดกะ ไม่งั้นกะจะกลายเป็นช่วงติดลบ
    if (cutoff.toISOString() <= shift.opened_at) return { stale: true as const }
    const split = splitShiftBills(newer)
    return {
      newer,
      cutoff,
      cash: (split.byMethod.cash ?? 0) + split.cashFromCancelled,
      bills: newer.length,
      firstAt: newer[0].created_at,
    }
  }

  async function closeShift() {
    if (!openShift) return
    if (!hasCount) {
      toast.error('กรุณานับเงินอย่างน้อย 1 ช่อง (ถ้าไม่มีให้ใส่ 0)')
      return
    }
    // ยกบิลที่มาหลังนับเงินไปกะหน้า = ปิดกะที่เวลาก่อนบิลนั้น (บิลจะตกนอกกะนี้ แล้วเช้าพรุ่งนี้
    // หน้าเปิดกะจะเจอว่าเป็น "บิลที่ขายหลังปิดกะ" แล้วยกมารวมให้พร้อมหักเงินออกจากยอดตั้งต้น)
    let closedAtISO = new Date().toISOString()
    let carriedNote = ''
    const after = await findBillsAfterCount(openShift)
    if (after && 'stale' in after) {
      setReloadKey((k) => k + 1)
      toast.error('ยอดขายของกะนี้เปลี่ยนไป (มีบิลคีย์ย้อนหลังหรือยกเลิกบิลเก่า) — ดึงยอดใหม่ให้แล้ว ตรวจเงินในเก๊ะอีกครั้งแล้วกดปิดกะ', { duration: 7000 })
      return
    }
    if (after) {
      const ok = await confirmDialog({
        title: 'มีลูกค้ามาเพิ่มหลังนับเงิน',
        message:
          `มีบิลเข้ามา ${after.bills} ใบ (เงินสด ฿${money(after.cash)}) หลังหน้านี้ดึงยอดเมื่อ ${fmtTime(loadedAt)}

` +
          `ถ้ายัง “ไม่ได้” นับเงินก้อนนี้เข้าใบนับ กดยกไปกะหน้า — ระบบจะปิดกะที่เวลา ${fmtTime(after.cutoff.toISOString())} ` +
          `บิลพวกนี้จะไปรวมกับกะหน้าตอนเปิดกะครั้งถัดไป เงินสดก็เหลือไว้ในเก๊ะตามนั้น

` +
          `ถ้านับรวมไปแล้ว ให้กดอัปเดตยอด แล้วกดปิดกะอีกครั้ง`,
        confirmLabel: 'ยกไปกะหน้า',
        cancelLabel: 'อัปเดตยอด',
        tone: 'primary',
      })
      if (!ok.confirmed) {
        setReloadKey((k) => k + 1)
        toast.success('อัปเดตยอดแล้ว — ตรวจเงินในเก๊ะอีกครั้งแล้วกดปิดกะ')
        return
      }
      closedAtISO = after.cutoff.toISOString()
      carriedNote =
        `[ยกบิลหลังนับเงินไปกะหน้า ${stampNow()} โดย ${currentUserName || 'พนักงาน'}] ` +
        `${after.bills} ใบ เงินสด ฿${money(after.cash)} ตั้งแต่ ${fmtTime(after.firstAt)} · ` +
        `ปิดกะที่เวลา ${fmtTime(closedAtISO)} เงินก้อนนี้ยังอยู่ในเก๊ะ รอรวมกับกะถัดไป`
    }
    if (leftover < 0) {
      toast.error('เงินทอนที่เหลือไว้ต้องไม่ติดลบ')
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
    const closeFields = {
        closed_at: closedAtISO,
        closed_by: currentUserId,
        expected_cash: expectedCash,
        closing_cash_counted: counted,
        cash_difference: difference,
        closing_denominations: denominations,
        cash_to_owner: cashToOwner,
        // สรุปเงินเข้า-ออกลงหมายเหตุด้วย เปิดดูประวัติกะย้อนหลังจะได้รู้ว่าทำไมยอดที่ควรมีไม่เท่ากับขายเงินสด
        notes: [
          // audit line ที่เขียนไว้ตอนเปิดกะ/แก้เงินตั้งต้น ต้องไม่หายไปตอนปิดกะ
          openShift.notes?.trim(),
          notes.trim(),
          carriedNote,
          movements.length > 0
            ? `เงินเข้าเก๊ะ ฿${money(cashIn)} · ออกจากเก๊ะ ฿${money(cashOut)} (${movements.length} รายการ)`
            : '',
          cashFromCancelled > 0 || cashRefunds > 0
            ? `บิลที่ยกเลิก: เงินสดที่รับไว้ ฿${money(cashFromCancelled)} · คืนเงินสด ฿${money(cashRefunds)}`
            : '',
          // เงินทอนขาดแล้วเจ้าของเอามาเติมตอนปิดกะ — เดิมไม่มีที่ลง ได้แต่ขึ้นเตือนแล้วปล่อยลอยไว้
          cashToOwner < 0 ? `เจ้าของเติมเงินทอนเข้าเก๊ะ ฿${money(-cashToOwner)}` : '',
          // เช็คยอดบัญชีแล้วต้องจดไว้ ไม่งั้นพรุ่งนี้ไม่มีใครรู้ว่าวันนั้นเงินครบหรือหายจริง
          bankChecked
            ? `เข้าบัญชีจริง ฿${money(bankActual)} (${accounts.map((a) => `${a} ฿${money(parseFloat(transfers[a] || '0') || 0)}`).join(' · ')}) · ในระบบกดว่าโอน/QR ฿${money(bankExpected)}`
            : '',
          channels.swapped > 0
            ? `เงินครบทั้งก้อน แต่ลงช่องทางผิด ฿${money(channels.swapped)} — เงินสด${difference > 0 ? 'เกิน' : 'ขาด'} ฿${money(Math.abs(difference))} หักกับบัญชีที่${bankDiff > 0 ? 'เกิน' : 'ขาด'}เท่ากันพอดี`
            : '',
        ].filter(Boolean).join('\n') || null,
    }
    const save = (extra: Record<string, unknown>) =>
      supabase.from('shifts').update({ ...closeFields, ...extra }).eq('id', openShift.id)
    let { error } = await save({
      closing_transfers: bankChecked
        ? Object.fromEntries(accounts.map((a) => [a, parseFloat(transfers[a] || '0') || 0]))
        : null,
    })
    // ยังไม่ได้รัน supabase-migration-shift-transfer-check.sql — ยอดที่เช็คได้ยังอยู่ในหมายเหตุอยู่ดี
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
        // เริ่มกะใหม่ที่ "เวลาที่ปิดกะนี้" ไม่ใช่ตอนนี้ — บิลที่ยกไปกะหน้าอยู่หลังเวลาปิดกะ
        // ถ้าเปิดกะใหม่ที่เวลาปัจจุบัน บิลพวกนั้นจะตกร่องระหว่างสองกะ ไม่อยู่ในกะไหนเลย
        opened_at: closedAtISO,
      })
      if (openError) {
        setLoading(false)
        toast.error('ปิดกะแล้ว แต่เปิดกะใหม่ไม่สำเร็จ: ' + openError.message)
        setCounts({})
        setKeepEdit(null)
        setTransfers({})
        setNotes('')
        setBaseCash(null)
        setBaseBank(null)
        setRestoredAt('')
        router.refresh()
        return
      }
      toast.success(
        carriedNote
          ? `ปิดกะแล้ว และเปิดกะใหม่ด้วยเงินคงเหลือ ฿${money(leftover)} — บิลหลังนับเงินไปอยู่ในกะใหม่แล้ว`
          : `ปิดกะแล้ว และเปิดกะใหม่ด้วยเงินคงเหลือ ฿${money(leftover)}`,
      )
    } else {
      toast.success(
        carriedNote
          ? 'ปิดกะแล้ว — บิลหลังนับเงินจะไปรวมกับกะถัดไปตอนเปิดกะ'
          : 'ปิดกะแล้ว — ถ้ามีลูกค้ามาอีก ขายได้เลย บิลจะยกไปรวมกะถัดไป',
        { duration: 6000 },
      )
    }
    setLoading(false)
    setCounts({})
    setKeepEdit(null)
    setTransfers({})
    setNotes('')
    setBaseCash(null)
    setBaseBank(null)
    setRestoredAt('')
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

  /**
   * กล่องเงินเข้า-ออกเก๊ะ — ใช้ทั้งในกะที่เปิดอยู่ และในการ์ดตอนยังไม่มีกะเปิด
   * ตอนไม่มีกะเปิด รายการถูกบันทึกแบบยังไม่ผูกกะ แล้วไปผูกตอนเปิดกะเช้าถัดไป
   */
  const cashMovementsBox = (
    <div className="border border-gray-200 rounded-lg p-3 mb-4">
      <p className="text-xs font-medium text-gray-600 mb-2">
        {openShift ? 'เงินเข้า-ออกเก๊ะระหว่างกะ' : 'เงินเข้า-ออกเก๊ะตอนไม่มีกะเปิด'}
      </p>

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
        {openShift
        ? 'บันทึกไว้แล้วยอด “เงินสดที่ควรมีในลิ้นชัก” จะขยับตาม ตอนปิดกะจะได้ไม่ขึ้นว่าขาด/เกินทั้งที่ไม่มีอะไรหาย'
        : 'ปิดกะไปแล้วแต่ต้องหยิบเงินออกจากเก๊ะ (หรือเอามาเติม) — ลงไว้ตรงนี้เลย เช้าเปิดกะระบบจะผูกเข้ากะใหม่แล้วหักออกจากยอดตั้งต้นให้เอง ไม่โผล่เป็นเงินขาด'}
      </p>
    </div>
  )

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
              ใส่เงินทอนตั้งต้นในเก๊ะ · ถ้ามีบิลที่ขายไปตอนยังไม่เปิดกะ ระบบจะถามว่าจะยกบิลพวกนั้นมารวมกะนี้ไหม
            </p>
            {!openShift && pendingSales && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-semibold">
                  {pendingSales.bills === 0 && pendingSales.cash === 0 ? (
                    <>มีเงินเข้า-ออกเก๊ะที่ยังไม่เข้ากะ {pendingSales.movementIds.length} รายการ</>
                  ) : (
                    <>
                      {pendingSales.afterClose ? 'มีบิลที่ขายหลังปิดกะ' : 'มีบิลที่ขายตอนยังไม่เปิดกะ'}{' '}
                      {pendingSales.bills} ใบ
                    </>
                  )}
                </p>
                <p>
                  {fmtDate(pendingSales.firstAt)}
                  {pendingSales.lastAt !== pendingSales.firstAt && <> - {fmtTime(pendingSales.lastAt)}</>} ·
                  เงินสด ฿{money(pendingSales.cash)}
                  {pendingSales.refunds > 0 && <> − คืนเงินสด ฿{money(pendingSales.refunds)}</>}
                  {pendingSales.returnRefunds > 0 && <> − คืนเงินสดจากใบคืน ฿{money(pendingSales.returnRefunds)}</>}
                  {pendingSales.movementsIn > 0 && <> + เติมเข้าเก๊ะ ฿{money(pendingSales.movementsIn)}</>}
                  {pendingSales.movementsOut > 0 && <> − หยิบออกจากเก๊ะ ฿{money(pendingSales.movementsOut)}</>}
                </p>
                <p className="text-amber-800">
                  เงิน ฿{money(pendingSales.net)} ก้อนนี้ควรอยู่ในเก๊ะ — กดเปิดกะแล้วระบบยกบิลมารวมกะใหม่
                  พร้อมหักออกจากยอดตั้งต้นให้เอง
                </p>
              </div>
            )}
            <button
              onClick={() => setShowOpenShift(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Wallet size={15} /> เปิดกะ
            </button>
          </div>

          {/* ปิดกะไปแล้วแต่เงินในเก๊ะยังขยับ — ต้องมีช่องให้ลง ไม่ใช่ปล่อยให้โผล่เป็นเงินขาดเช้าวันรุ่งขึ้น */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 w-full max-w-sm">
            <div className="flex items-center gap-2 mb-1">
              <ArrowRightLeft size={18} className="text-gray-400" />
              <h2 className="font-semibold text-gray-900">เงินเข้า-ออกเก๊ะ</h2>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              ปิดกะไปแล้วแต่ยังต้องหยิบเงินออกจากเก๊ะหรือเอามาเติม — ลงไว้ตรงนี้ได้เลย ไม่ต้องรอเปิดกะ
            </p>
            {cashMovementsBox}
          </div>
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
                {cashReturnRefunds > 0 && (
                  <div className="flex justify-between text-red-500" title="เงินสดที่จ่ายคืนลูกค้าจากใบคืน/เปลี่ยนสินค้า — ส่วนที่หักกับบิลใหม่ไม่นับตรงนี้">
                    <span>คืนเงินสด (ใบคืน/เปลี่ยนสินค้า)</span><span>-฿{money(cashReturnRefunds)}</span>
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

          {cashMovementsBox}

          <div className="flex items-baseline justify-between gap-3 mb-2">
            <label className="block text-xs font-medium text-gray-600">นับเงินสดจริง (ใส่จำนวนใบ/เหรียญ)</label>
            {(hasCount || bankChecked) && (
              <button type="button" onClick={clearDraft} className="shrink-0 text-xs font-medium text-gray-400 hover:text-red-500">
                ล้างใบนับ
              </button>
            )}
          </div>
          {(hasCount || bankChecked) && (
            <p className="text-xs text-gray-500 mb-2">
              {restoredAt
                ? `ดึงร่างที่กรอกไว้เมื่อ ${fmtTime(restoredAt)} กลับมาให้แล้ว`
                : 'บันทึกร่างไว้ในเครื่องนี้อัตโนมัติ ไปหน้าอื่นแล้วกลับมาไม่ต้องนับใหม่'}
            </p>
          )}
          {hasMoved && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 mb-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">ยอดในระบบขยับหลังเริ่มนับ</p>
              {Math.abs(movedCash) >= 0.005 && (
                <p>เงินสดที่ควรมี{movedCash > 0 ? 'เพิ่ม' : 'ลด'} <b>฿{money(Math.abs(movedCash))}</b> — ถ้ายังไม่ได้นับรวม แก้ช่องนับตามเงินที่{movedCash > 0 ? 'รับเข้าเก๊ะ' : 'ออกจากเก๊ะ'}</p>
              )}
              {Math.abs(movedBank) >= 0.005 && (
                <p>โอน/QR ในระบบ{movedBank > 0 ? 'เพิ่ม' : 'ลด'} <b>฿{money(Math.abs(movedBank))}</b> — เปิดแอปดูยอดเข้าบัญชีอีกครั้ง</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setBaseCash(hasCount ? expectedCash : null)
                  setBaseBank(bankChecked ? bankExpected : null)
                }}
                className="font-medium text-amber-800 underline"
              >
                แก้แล้ว ไม่ต้องเตือน
              </button>
            </div>
          )}
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
                        onChange={(e) => {
                          const next = { ...counts, [d.value]: e.target.value }
                          setCounts(next)
                          const empty = Object.values(next).every((v) => v === '')
                          setBaseCash((b) => (empty ? null : b ?? (loadingSummary ? null : expectedCash)))
                        }}
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
                      onChange={(e) => {
                        const next = { ...transfers, [a]: e.target.value }
                        setTransfers(next)
                        const empty = Object.values(next).every((v) => v.trim() === '')
                        setBaseBank((b) => (empty ? null : b ?? (loadingSummary ? null : bankExpected)))
                      }}
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
            <label className="block text-xs font-medium text-gray-600">เงินทอนที่เหลือไว้ให้พรุ่งนี้ (ยอดรวม)</label>
            {keepEdit != null && (
              <button
                type="button"
                onClick={() => setKeepEdit(null)}
                className="text-xs font-medium text-gray-400 hover:text-gray-600"
              >
                คืนค่าที่ระบบคิดให้
              </button>
            )}
          </div>
          <input
            type="number" min={0} step="0.01" inputMode="decimal"
            value={keepEdit ?? (hasCount ? String(keepDefault) : '')}
            onChange={(e) => setKeepEdit(e.target.value)}
            className={inputClass}
            placeholder="0"
          />
          <p className="text-xs text-gray-500 mt-1 mb-3">
            {floatTarget != null
              ? <>ชุดที่เตรียมไว้ ฿{money(floatTarget)}{keptLabels && <> + {keptLabels}ที่มีในเก๊ะ</>} — ที่เหลือคือเงินให้เจ้าของ</>
              : 'ส่วนที่ไม่ได้เหลือไว้คือเงินให้เจ้าของ'}
          </p>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
            <div className={`flex justify-between ${cashToOwner < 0 ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
              <span>{cashToOwner < 0 ? 'เจ้าของเติมเข้าเก๊ะ' : 'ให้เจ้าของ'}</span>
              <span>{cashToOwner === 0 ? '—' : cashToOwner > 0 ? `-฿${money(cashToOwner)}` : `+฿${money(-cashToOwner)}`}</span>
            </div>
            <div className="flex justify-between font-medium text-gray-900 pt-1 border-t border-gray-200">
              <span>เหลือในลิ้นชัก (เงินตั้งต้นกะถัดไป)</span><span>฿{money(leftover)}</span>
            </div>
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

            {/* ส่งต่อ — คืนที่โยกทั้งชุดต้องเขียนตามที่มือทำจริง: เงินออกจากเก๊ะทั้งก้อน แล้วชุดใหม่
                ของเจ้าของลงไปแทน · เขียนเป็นยอดสุทธิก้อนเดียว ("ให้เจ้าของ ฿2,351") อ่านแล้วเหมือน
                หยิบออกไปแค่นั้นแล้วที่เหลือเป็นของเดิมในเก๊ะ ซึ่งไม่ใช่เรื่องที่เกิดขึ้นเลย
                (22 พ.ย. 69 เจ้าของว่า "ต้องให้เจ้าของทั้งหมด เจ้าของให้ 4000 รวมกับที่มีแบงค์ห้าสิบ")
                ยอดสุทธิยังอยู่ แต่เป็นผลลัพธ์ท้ายสุด ไม่ใช่พาดหัว */}
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
              {swapPlan ? (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>
                      รวบออกให้เจ้าของ <span className="text-xs text-gray-400">ทั้งเก๊ะ{keptLabels && ` ยกเว้น${keptLabels}`}</span>
                    </span>
                    <span className="tabular-nums">฿{money(swapPlan.outTotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>เจ้าของวางชุดใหม่ลงเก๊ะ</span>
                    <span className="tabular-nums">−฿{money(swapPlan.putTotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span className="text-xs">{swapPlan.net < 0 ? 'สุทธิเจ้าของเติมเข้า' : 'สุทธิเจ้าของรับไป'}</span>
                    <span className="text-xs tabular-nums">{swapPlan.net === 0 ? '—' : `฿${money(Math.abs(swapPlan.net))}`}</span>
                  </div>
                  <div className="flex justify-between font-medium text-gray-900">
                    <span>
                      เหลือเป็นเงินทอนพรุ่งนี้
                      {swapPlan.stayTotal > 0 && (
                        <span className="text-xs font-normal text-gray-400"> ชุดใหม่ + {keptLabels} ฿{money(swapPlan.stayTotal)}</span>
                      )}
                    </span>
                    <span className="tabular-nums">฿{money(leftover)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>{cashToOwner < 0 ? 'เจ้าของเติมเข้าเก๊ะ' : 'ให้เจ้าของ'}</span>
                    <span className="tabular-nums">{cashToOwner === 0 ? '—' : `฿${money(Math.abs(cashToOwner))}`}</span>
                  </div>
                  <div className="flex justify-between font-medium text-gray-900">
                    <span>เหลือเป็นเงินทอนพรุ่งนี้</span><span className="tabular-nums">฿{money(leftover)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ใบสรุปสำหรับพิมพ์ / เซฟเป็น PDF — บนจอซ่อนไว้ โผล่เฉพาะตอนสั่งพิมพ์ (ดู globals.css)
              จงใจให้พิมพ์ได้ "ก่อน" ปิดกะ: นับพลาดก็แก้เลขแล้วพิมพ์ใหม่ได้ ไม่ต้องไปแก้กะที่ปิดไปแล้ว */}
          <style>{`@page { size: A5 portrait; margin: 10mm; }`}</style>
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

                {/* ใบนี้มีช่อง "ผู้รับเงิน" ให้เซ็น — ตัวเลขที่เซ็นรับต้องเป็นเงินที่ยื่นให้จริง
                    ไม่ใช่ยอดสุทธิหลังหักชุดที่วางกลับลงไป (ดูบล็อกเดียวกันบนจอ) */}
                <tr><td className="font-bold pt-2" colSpan={2}>ส่งต่อ</td></tr>
                {swapPlan ? (
                  <>
                    <tr>
                      <td className="pl-3">รวบออกให้เจ้าของ (ทั้งเก๊ะ{keptLabels && ` ยกเว้น${keptLabels}`})</td>
                      <td className="text-right tabular-nums">฿{money(swapPlan.outTotal)}</td>
                    </tr>
                    <tr>
                      <td className="pl-3">เจ้าของวางชุดใหม่ลงเก๊ะ</td>
                      <td className="text-right tabular-nums">−฿{money(swapPlan.putTotal)}</td>
                    </tr>
                    <tr>
                      <td className="pl-3">{swapPlan.net < 0 ? 'สุทธิเจ้าของเติมเข้า' : 'สุทธิเจ้าของรับไป'}</td>
                      <td className="text-right tabular-nums">{swapPlan.net === 0 ? '—' : `฿${money(Math.abs(swapPlan.net))}`}</td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td className="pl-3">{cashToOwner < 0 ? 'เจ้าของเติมเข้าเก๊ะ' : 'ให้เจ้าของ'}</td>
                    <td className="text-right tabular-nums">{cashToOwner === 0 ? '—' : `฿${money(Math.abs(cashToOwner))}`}</td>
                  </tr>
                )}
                <tr>
                  <td className="pl-3 font-medium">
                    เหลือเป็นเงินทอนพรุ่งนี้
                    {swapPlan && swapPlan.stayTotal > 0 && (
                      <span className="font-normal"> (ชุดใหม่ + {keptLabels} ฿{money(swapPlan.stayTotal)})</span>
                    )}
                  </td>
                  <td className="text-right font-bold tabular-nums">฿{money(leftover)}</td>
                </tr>
              </tbody>
            </table>

            <p className="mt-2 text-[11px]"><span className="font-medium">นับได้:</span> {denomLine(countedDenoms) || '—'}</p>
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
