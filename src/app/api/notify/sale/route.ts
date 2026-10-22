import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/require-staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSaleMessage, notifyEvent } from '@/lib/notify'
import { CHANNEL_LABEL, platformPaymentLabel } from '@/lib/salesChannel'
import type { PaymentMethod, SalesChannel } from '@/lib/types'

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  card: 'บัตรเครดิต',
  qr: 'QR Code',
}

// เรียกจากหน้าขายหลังบันทึกบิลสำเร็จ — ฝั่ง client ไม่มี TELEGRAM_BOT_TOKEN (และไม่ควรมี)
export async function POST(request: NextRequest) {
  if (!(await getStaff())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { transactionId } = await request.json()
  if (!transactionId) return NextResponse.json({ error: 'missing transactionId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: tx } = await admin
    .from('transactions')
    .select('id, transaction_number, total, payment_method, sales_channel, status, customers(name), profiles!transactions_cashier_id_fkey(name), transaction_items(id)')
    .eq('id', transactionId)
    .maybeSingle()

  if (!tx || tx.status !== 'completed') {
    return NextResponse.json({ error: 'ไม่พบบิล' }, { status: 404 })
  }

  const channel = (tx.sales_channel ?? 'store') as SalesChannel
  const cashier = tx.profiles as unknown as { name: string } | null
  const customer = tx.customers as unknown as { name: string } | null

  await notifyEvent(
    'sale',
    buildSaleMessage({
      transactionNumber: tx.transaction_number,
      total: tx.total,
      itemCount: (tx.transaction_items ?? []).length,
      // บิลแพลตฟอร์มบอกว่า "รับผ่าน Shopee" ในบรรทัดรับเงินไปเลย ไม่ต้องซ้ำด้วยชื่อช่องทางอีก
      paymentLabel: platformPaymentLabel(channel) ?? PAYMENT_LABEL[tx.payment_method as PaymentMethod] ?? tx.payment_method,
      channelLabel: channel === 'booth' ? CHANNEL_LABEL[channel] : null,
      cashier: cashier?.name ?? null,
      customer: customer?.name ?? null,
    }),
    { dedupeKey: `sale:${tx.id}` }
  )

  return NextResponse.json({ sent: true })
}
