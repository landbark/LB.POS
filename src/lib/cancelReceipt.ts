import { createClient } from '@/lib/supabase/client'
import { applyPoints } from '@/lib/points'
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
    .select('id, transaction_number, total, points_earned, points_used, points_used_reward, credit_used, customer_id, status')
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
      // เครดิตที่ต้องคืนกลับ = เครดิตที่เคยใช้จ่ายในบิลนี้ (คืนกลับเสมอ) + เครดิตใหม่จากการเลือกคืนเงินเป็นเครดิต
      const creditRestore = tx.credit_used + (refundMethod === 'credit' ? tx.total : 0)
      await supabase
        .from('customers')
        .update({
          total_spent: Math.max(0, customer.total_spent - tx.total),
          credit_balance: customer.credit_balance + creditRestore,
        })
        .eq('id', tx.customer_id)

      // ถอนแต้มที่บิลนี้ให้ไว้ออกจากก้อนของบิลนี้เอง และคืนแต้มที่ลูกค้าจ่ายไป
      // (ทั้งส่วนลดแต้มและของแลก — ของแลกคืนสต็อกไปพร้อมสินค้าอื่นแล้วถ้าเลือกคืนสต็อก)
      // แต้มที่คืนกลับเข้าก้อนเดิม วันหมดอายุเดิมจึงไม่ถูกต่ออายุเพราะยกเลิกบิล
      const revoke = tx.points_earned ?? 0
      const restore = (tx.points_used ?? 0) + (tx.points_used_reward ?? 0)
      if (revoke > 0 || restore > 0) {
        await applyPoints(supabase, tx.customer_id, { revoke, restore, transactionId })
      }
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

  // แจ้งเตือน Telegram + กระดิ่งในระบบ — งานเสริม ล้มเหลวไม่ให้กระทบการยกเลิก
  // (ยิงเฉพาะตอนอัปเดตสถานะสำเร็จ ไม่งั้นจะเตือนบิลที่ยังไม่ได้ยกเลิกจริง)
  if (!updateError) {
    fetch('/api/notify/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId }),
    }).catch(() => {})
  }

  return { error: updateError?.message ?? null }
}
