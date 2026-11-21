import { createClient } from '@/lib/supabase/client'
import { REFUND_LABEL } from '@/lib/refunds'
import type { RefundMethod } from '@/lib/types'

interface UpdateRefundMethodParams {
  transactionId: string
  method: RefundMethod
  editedBy: string
}

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * แก้ช่องทางคืนเงินของบิลที่ยกเลิกไปแล้วแต่กดผิดช่อง (ยอดบิล สต็อค แต้ม ไม่ขยับ)
 *
 * จุดที่ต้องระวังคือ 'credit' — ช่องนี้ไม่ใช่แค่ป้ายชื่อ ตอนยกเลิกมันเพิ่มเครดิตเข้ากระเป๋า
 * ลูกค้าจริง เพราะฉะนั้นแก้ออกจากเครดิตต้องหักคืน และแก้เข้าเครดิตต้องเพิ่มให้
 * ถ้าลูกค้าใช้เครดิตก้อนนั้นไปแล้วจนหักกลับไม่พอ ต้องไม่ให้แก้ ไม่ใช่ปล่อยให้ยอดติดลบ
 *
 * เก็บช่องทางที่กดไว้ครั้งแรกใน refund_method_original + ใครแก้เมื่อไหร่ (เหมือน updatePaymentMethod)
 */
export async function updateRefundMethod({
  transactionId,
  method,
  editedBy,
}: UpdateRefundMethodParams): Promise<{ error: string | null }> {
  const supabase = createClient()

  const { data: tx, error: fetchError } = await supabase
    .from('transactions')
    .select('id, total, status, refund_method, refund_method_original, customer_id')
    .eq('id', transactionId)
    .single()

  if (fetchError || !tx) return { error: 'ไม่พบใบเสร็จ' }
  if (tx.status !== 'cancelled') {
    return { error: 'บิลนี้ยังไม่ถูกยกเลิก — ถ้าจะแก้วิธีรับเงินให้ใช้ปุ่มแก้วิธีรับเงินแทน' }
  }
  if (tx.refund_method === method) return { error: 'ช่องทางคืนเงินเดิมอยู่แล้ว' }
  if (method === 'credit' && !tx.customer_id) {
    return { error: 'เก็บเป็นเครดิตได้เฉพาะบิลที่ผูกลูกค้าสมาชิกไว้' }
  }

  const wasCredit = tx.refund_method === 'credit'
  const toCredit = method === 'credit'
  const total = Number(tx.total)

  // ขยับเครดิตก่อนแก้ป้ายช่องทาง — ถ้าหักคืนไม่ได้ก็ยังไม่มีอะไรเปลี่ยน
  if ((wasCredit || toCredit) && tx.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('credit_balance')
      .eq('id', tx.customer_id)
      .single()
    if (!customer) return { error: 'ไม่พบลูกค้าของบิลนี้' }

    const delta = (toCredit ? total : 0) - (wasCredit ? total : 0)
    const next = Number(customer.credit_balance) + delta
    if (next < 0) {
      return {
        error:
          `ลูกค้าใช้เครดิตไปแล้ว เหลือ ฿${money(Number(customer.credit_balance))} ` +
          `หักคืน ฿${money(total)} ไม่พอ — แก้ช่องทางคืนเงินของบิลนี้ไม่ได้`,
      }
    }

    const { error: creditError } = await supabase
      .from('customers')
      .update({ credit_balance: next })
      .eq('id', tx.customer_id)
    if (creditError) return { error: creditError.message }
  }

  const { error } = await supabase
    .from('transactions')
    .update({
      refund_method: method,
      // เซ็ตครั้งแรกครั้งเดียว — แก้ซ้ำยังเห็นว่าตอนยกเลิกจริงกดช่องไหนไว้
      refund_method_original: tx.refund_method_original ?? tx.refund_method,
      refund_edited_at: new Date().toISOString(),
      refund_edited_by: editedBy,
    })
    .eq('id', transactionId)
    // กันสองคนแก้พร้อมกัน / แก้ตอนบิลถูกปลดยกเลิก
    .eq('status', 'cancelled')

  // ไม่ยิงแจ้งเตือน — ปุ่มนี้เปิดให้เฉพาะเจ้าของร้าน ส่งเตือนก็เตือนตัวเอง
  // ร่องรอยการแก้อยู่ใน refund_method_original + refund_edited_by/at แล้ว
  return { error: error?.message ?? null }
}

/** ป้ายบอกว่าแก้มาจากช่องไหน ใช้โชว์ในทะเบียนเอกสาร */
export function refundEditNote(original: RefundMethod | null): string | null {
  return original ? `เดิมกดไว้ว่า${REFUND_LABEL[original] ?? original}` : null
}
