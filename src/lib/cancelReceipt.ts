import { createClient } from '@/lib/supabase/client'
import type { RefundMethod } from '@/lib/types'

interface CancelReceiptParams {
  transactionId: string
  restock: boolean
  refundMethod: RefundMethod
  reason: string
  cancelledBy: string
}

// ยกเลิกใบเสร็จ: คืนสต็อค (ถ้าเลือก), คืนแต้ม/ยอดซื้อสะสมของลูกค้า, บันทึกวิธีคืนเงิน (เครดิตจะเพิ่มเข้า credit_balance)
export async function cancelReceipt({
  transactionId,
  restock,
  refundMethod,
  reason,
  cancelledBy,
}: CancelReceiptParams): Promise<{ error: string | null }> {
  const supabase = createClient()

  const { data: tx, error: txFetchError } = await supabase
    .from('transactions')
    .select('id, transaction_number, total, points_earned, points_used, credit_used, customer_id, status')
    .eq('id', transactionId)
    .single()

  if (txFetchError || !tx) return { error: 'ไม่พบใบเสร็จ' }
  if (tx.status === 'cancelled') return { error: 'ใบเสร็จนี้ถูกยกเลิกไปแล้ว' }
  if (refundMethod === 'credit' && !tx.customer_id) {
    return { error: 'คืนเป็นเครดิตได้เฉพาะลูกค้าสมาชิกเท่านั้น' }
  }

  if (restock) {
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('product_id, product_lot_id, quantity')
      .eq('transaction_id', transactionId)
      .eq('type', 'sale')

    for (const m of movements ?? []) {
      if (!m.product_lot_id) continue
      const { data: lot } = await supabase
        .from('product_lots')
        .select('quantity')
        .eq('id', m.product_lot_id)
        .single()
      if (!lot) continue

      await supabase
        .from('product_lots')
        .update({ quantity: lot.quantity + m.quantity })
        .eq('id', m.product_lot_id)

      await supabase.from('stock_movements').insert({
        product_id: m.product_id,
        product_lot_id: m.product_lot_id,
        transaction_id: transactionId,
        type: 'cancel',
        quantity: m.quantity,
        reason: `ยกเลิกใบเสร็จ ${tx.transaction_number}`,
        created_by: cancelledBy,
      })
    }
  }

  if (tx.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('points, total_spent, credit_balance')
      .eq('id', tx.customer_id)
      .single()

    if (customer) {
      const pointsDelta = tx.points_earned - tx.points_used
      // เครดิตที่ต้องคืนกลับ = เครดิตที่เคยใช้จ่ายในบิลนี้ (คืนกลับเสมอ) + เครดิตใหม่จากการเลือกคืนเงินเป็นเครดิต
      const creditRestore = tx.credit_used + (refundMethod === 'credit' ? tx.total : 0)
      await supabase
        .from('customers')
        .update({
          points: Math.max(0, customer.points - pointsDelta),
          total_spent: Math.max(0, customer.total_spent - tx.total),
          credit_balance: customer.credit_balance + creditRestore,
        })
        .eq('id', tx.customer_id)
    }
  }

  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelledBy,
      cancel_reason: reason.trim() || null,
      restocked: restock,
      refund_method: refundMethod,
    })
    .eq('id', transactionId)

  // บิลนี้มาจากคลินิก → ส่งเวชระเบียนกลับเข้าคิวรอเก็บเงิน (ไม่งั้นจะค้างเป็น "เก็บเงินแล้ว" ทั้งที่บิลถูกยกเลิก)
  await supabase
    .from('visits')
    .update({ status: 'pending_payment', transaction_id: null })
    .eq('transaction_id', transactionId)

  return { error: updateError?.message ?? null }
}
