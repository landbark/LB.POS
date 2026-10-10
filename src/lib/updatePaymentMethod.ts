import { createClient } from '@/lib/supabase/client'
import type { PaymentMethod } from '@/lib/types'

interface UpdatePaymentMethodParams {
  transactionId: string
  method: PaymentMethod
  /** กรอกได้เฉพาะเงินสด — ไม่ส่งมาจะถือว่ารับพอดี (ไม่มีเงินทอน) */
  cashReceived?: number | null
  editedBy: string
}

// แก้วิธีรับเงินของใบเสร็จที่บันทึกผิด (ยอดเงินไม่เปลี่ยน สต็อค/แต้มไม่ขยับ)
// เก็บวิธีเดิมครั้งแรกไว้ใน payment_method_original + ใครแก้เมื่อไหร่
export async function updatePaymentMethod({
  transactionId,
  method,
  cashReceived,
  editedBy,
}: UpdatePaymentMethodParams): Promise<{ error: string | null }> {
  const supabase = createClient()

  const { data: tx, error: fetchError } = await supabase
    .from('transactions')
    .select('id, total, status, payment_method, payment_method_original')
    .eq('id', transactionId)
    .single()

  if (fetchError || !tx) return { error: 'ไม่พบใบเสร็จ' }
  if (tx.status === 'cancelled') return { error: 'ใบเสร็จนี้ถูกยกเลิกแล้ว แก้วิธีรับเงินไม่ได้' }
  if (tx.payment_method === method) return { error: 'วิธีรับเงินเดิมอยู่แล้ว' }

  const received = method === 'cash' ? (cashReceived ?? tx.total) : null
  if (received != null && received < tx.total) return { error: 'เงินที่รับมาน้อยกว่ายอดบิล' }

  const { error } = await supabase
    .from('transactions')
    .update({
      payment_method: method,
      cash_received: received,
      change_given: received == null ? null : Math.max(0, received - tx.total),
      // เซ็ตครั้งแรกครั้งเดียว — แก้ซ้ำยังเห็นว่าตอนขายจริงบันทึกเป็นอะไร
      payment_method_original: tx.payment_method_original ?? tx.payment_method,
      payment_edited_at: new Date().toISOString(),
      payment_edited_by: editedBy,
    })
    .eq('id', transactionId)
    // กันสองคนแก้พร้อมกัน / แก้ขณะอีกคนกดยกเลิกบิล
    .eq('status', 'completed')

  return { error: error?.message ?? null }
}
