import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ข้อมูลสมาชิก + ประวัติการซื้อล่าสุด สำหรับหน้า LIFF /member — ระบุตัวตนด้วย lineUserId เท่านั้น (ไม่ auth)
export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get('lineUserId')
  if (!lineUserId) return NextResponse.json({ error: 'missing lineUserId' }, { status: 400 })

  const admin = createAdminClient()

  const { data: customer, error } = await admin
    .from('customers')
    .select('id, name, points, total_spent')
    .eq('line_user_id', lineUserId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!customer) return NextResponse.json({ linked: false })

  const { data: transactions } = await admin
    .from('transactions')
    .select(`
      id, transaction_number, total, points_earned, points_used, created_at,
      transaction_items(quantity, unit_price, subtotal, products(name, unit))
    `)
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ linked: true, customer, transactions: transactions ?? [] })
}
