import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyLineIdToken } from '@/lib/line-id-token'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * ข้อมูลสมาชิก + ประวัติการซื้อล่าสุด สำหรับหน้า LIFF /member
 *
 * เดิมรับ ?lineUserId= มาตรง ๆ แล้วเชื่อเลย — ใครรู้ LINE user id ของคนอื่น
 * ก็เปิดดูประวัติการซื้อของคนนั้นได้ ตอนนี้ต้องส่ง ID token ที่ LINE เซ็นมา
 * แล้วเราตรวจกับ LINE ก่อน จึงจะรู้ว่าเป็นเจ้าของบัญชีจริง
 *
 * ใช้ POST เพราะ token ไม่ควรไปโผล่ใน query string (ติดไปกับ log ทุกชั้น)
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(`member-me:${clientIp(request)}`, { limit: 30, windowMs: 60_000 })
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'เรียกถี่เกินไป กรุณารอสักครู่' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }

  const { idToken } = await request.json().catch(() => ({ idToken: null }))
  const lineUserId = await verifyLineIdToken(idToken)
  if (!lineUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
