import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/require-staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildReturnMessage, notifyEvent } from '@/lib/notify'
import { pushAppNotification } from '@/lib/appNotify'
import type { RefundMethod } from '@/lib/types'

const REFUND_LABEL: Record<RefundMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  credit: 'เก็บเป็นเครดิตร้าน',
}

const baht = (n: number) => `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface ReturnItemRow {
  quantity: number
  unit_name: string | null
  amount: number
  products: { name: string; unit: string } | null
}

/** เรียกหลังบันทึกใบคืนสำเร็จ — ส่ง Telegram ให้เจ้าของ + ขึ้นกระดิ่งในระบบให้ทุกเครื่อง */
export async function POST(request: NextRequest) {
  if (!(await getStaff())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { returnId } = await request.json()
  if (!returnId) return NextResponse.json({ error: 'missing returnId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: ret } = await admin
    .from('returns')
    .select(`
      id, return_number, return_value, offset_amount, refund_amount, refund_method, restocked, reason,
      transactions!returns_transaction_id_fkey(transaction_number),
      exchange:transactions!returns_exchange_transaction_id_fkey(transaction_number, total),
      customers(name),
      profiles(name),
      return_items(quantity, unit_name, amount, products(name, unit))
    `)
    .eq('id', returnId)
    .maybeSingle()

  if (!ret) return NextResponse.json({ error: 'ไม่พบใบคืน' }, { status: 404 })

  const original = ret.transactions as unknown as { transaction_number: string } | null
  const exchange = ret.exchange as unknown as { transaction_number: string; total: number } | null
  const customer = ret.customers as unknown as { name: string } | null
  const by = ret.profiles as unknown as { name: string } | null
  const method = ret.refund_method as RefundMethod | null

  const itemLines = ((ret.return_items ?? []) as unknown as ReturnItemRow[]).map(
    (i) => `${i.products?.name ?? 'สินค้า'} × ${i.quantity} ${i.unit_name ?? i.products?.unit ?? ''} — ${baht(Number(i.amount))}`,
  )

  const info = {
    returnNumber: ret.return_number,
    transactionNumber: original?.transaction_number ?? '—',
    exchangeNumber: exchange?.transaction_number ?? null,
    itemLines,
    returnValue: Number(ret.return_value),
    offsetAmount: Number(ret.offset_amount),
    refundAmount: Number(ret.refund_amount),
    refundLabel: method ? REFUND_LABEL[method] : null,
    extraPaid: exchange ? Number(exchange.total) : 0,
    restocked: ret.restocked,
    reason: ret.reason,
    by: by?.name ?? null,
    customer: customer?.name ?? null,
  }

  await notifyEvent('product_return', buildReturnMessage(info), { dedupeKey: `return:${ret.id}` })

  await pushAppNotification(admin, {
    kind: 'product_return',
    title: exchange
      ? `เปลี่ยนสินค้า ${ret.return_number} · บิล ${info.transactionNumber} → ${exchange.transaction_number}`
      : `รับคืนสินค้า ${ret.return_number} · บิล ${info.transactionNumber}`,
    body: [
      `มูลค่าที่รับคืน ${baht(info.returnValue)}`,
      info.extraPaid > 0 ? `ลูกค้าจ่ายเพิ่ม ${baht(info.extraPaid)}` : null,
      info.refundAmount > 0 ? `คืนลูกค้า ${baht(info.refundAmount)}${info.refundLabel ? ` (${info.refundLabel})` : ''}` : null,
      info.by ? `โดย ${info.by}` : null,
      info.reason ? `เหตุผล: ${info.reason}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    link: '/admin/documents?tab=return',
  })

  return NextResponse.json({ sent: true })
}
