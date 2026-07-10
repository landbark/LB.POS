import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import ReceiptView from './ReceiptView'

// ใช้ admin client เพราะหน้านี้เปิดได้ทั้งพนักงาน (จาก POS) และลูกค้า (จากหน้าเช็คแต้ม LINE ที่ไม่ auth staff)
// ปลอดภัยเพราะเข้าถึงได้เฉพาะคนที่รู้ transaction id (UUID) เท่านั้น
export default async function ReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { id } = await params
  const { from } = await searchParams
  const supabase = createAdminClient()

  const [{ data: tx }, { data: store }] = await Promise.all([
    supabase
      .from('transactions')
      .select(`
        id, transaction_number, created_at, subtotal, discount, total,
        payment_method, cash_received, change_given, points_earned, points_used,
        customers(name, phone),
        profiles(name),
        transaction_items(quantity, unit_price, discount, subtotal, products(name, unit))
      `)
      .eq('id', id)
      .single(),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])

  if (!tx) notFound()

  return <ReceiptView tx={tx as never} store={store} backHref={from === 'member' ? '/member' : '/pos'} />
}
