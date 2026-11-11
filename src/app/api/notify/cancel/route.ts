import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/require-staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCancelMessage, notifyEvent } from '@/lib/notify'
import { pushAppNotification } from '@/lib/appNotify'
import { thaiToday } from '@/lib/thaiDate'
import { fmtThai } from '@/lib/backdate'
import type { RefundMethod } from '@/lib/types'

const REFUND_LABEL: Record<RefundMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  credit: 'เก็บเป็นเครดิตร้าน',
}

const baht = (n: number) => `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** เรียกจากหน้าทะเบียนใบเสร็จหลังยกเลิกสำเร็จ — ฝั่ง client ไม่มี TELEGRAM_BOT_TOKEN (และไม่ควรมี) */
export async function POST(request: NextRequest) {
  if (!(await getStaff())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { transactionId } = await request.json()
  if (!transactionId) return NextResponse.json({ error: 'missing transactionId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: tx } = await admin
    .from('transactions')
    .select('id, transaction_number, total, status, created_at, cancel_reason, restocked, refund_method, customers(name), cancelled_by_profile:profiles!transactions_cancelled_by_fkey(name)')
    .eq('id', transactionId)
    .maybeSingle()

  if (!tx || tx.status !== 'cancelled') {
    return NextResponse.json({ error: 'ไม่พบใบเสร็จที่ยกเลิก' }, { status: 404 })
  }

  const customer = tx.customers as unknown as { name: string } | null
  const by = tx.cancelled_by_profile as unknown as { name: string } | null
  const method = tx.refund_method as RefundMethod | null
  // วันที่ขายจริงเทียบวันนี้ (เวลาไทย) — ยกเลิกข้ามวันทำให้ยอดของวันนั้นเปลี่ยนย้อนหลัง
  const soldDate = new Date(tx.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const crossDay = soldDate !== thaiToday()

  const info = {
    transactionNumber: tx.transaction_number,
    total: Number(tx.total),
    refundLabel: method ? REFUND_LABEL[method] : 'ไม่ระบุ',
    restocked: tx.restocked !== false,
    reason: tx.cancel_reason,
    by: by?.name ?? null,
    customer: customer?.name ?? null,
    soldAt: fmtThai(tx.created_at),
    crossDay,
  }

  await notifyEvent('receipt_cancelled', buildCancelMessage(info), { dedupeKey: `cancel:${tx.id}` })

  await pushAppNotification(admin, {
    kind: 'receipt_cancelled',
    title: `ยกเลิกใบเสร็จ ${tx.transaction_number} · ${baht(Number(tx.total))}`,
    body: [
      `คืนเงิน: ${info.refundLabel}`,
      info.restocked ? 'คืนของเข้าสต็อกแล้ว' : 'ไม่ได้คืนของเข้าสต็อก',
      info.by ? `โดย ${info.by}` : null,
      crossDay ? `บิลของ ${info.soldAt} — ยอดวันนั้นเปลี่ยนย้อนหลัง` : null,
      tx.cancel_reason ? `เหตุผล: ${tx.cancel_reason}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    link: '/admin/documents',
  })

  return NextResponse.json({ sent: true })
}
