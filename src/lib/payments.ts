// เงินเข้าร้านทางไหนบ้างในบิลหนึ่งใบ — ใช้ร่วมกันทุกที่ที่ต้องรวมยอดตามช่องทาง
//
// บิลที่จ่ายทางเดียวไม่มีแถวใน transaction_payments เลย (บิลเก่าทั้งหมดด้วย) ตัวช่วยนี้จึง
// คืนค่าเป็นช่องทางเดียวเต็มยอดให้ ไม่ต้อง backfill และหน้าไหนที่ยังไม่ได้ขอ transaction_payments
// ติดมากับ query ก็ยังได้ตัวเลขเดิมเป๊ะ ไม่พัง

import type { PaymentMethod } from '@/lib/types'

export interface PaymentLine {
  method: PaymentMethod
  amount: number
}

/** บิลที่ select มาพร้อม `transaction_payments(method, amount)` (ถ้าไม่ได้ขอมาก็ยังใช้ได้) */
export interface PaidTransaction {
  total: number
  payment_method: PaymentMethod
  transaction_payments?: PaymentLine[] | null
}

export function paymentLines(tx: PaidTransaction): PaymentLine[] {
  const split = tx.transaction_payments ?? []
  return split.length > 0
    ? split.map((l) => ({ method: l.method, amount: Number(l.amount) }))
    : [{ method: tx.payment_method, amount: Number(tx.total) }]
}

/** บิลนี้เก็บเงินแยกหลายทางไหม */
export function isSplitPayment(tx: PaidTransaction) {
  return (tx.transaction_payments?.length ?? 0) > 1
}

/** รวมยอดแยกตามช่องทางจากหลายบิล — ใช้กับสรุปกะ / รายวัน / รายงาน */
export function sumByMethod(txs: PaidTransaction[]): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const tx of txs) {
    for (const line of paymentLines(tx)) {
      acc[line.method] = (acc[line.method] ?? 0) + line.amount
    }
  }
  return acc
}

/** ยอดที่เข้าช่องทางเดียวจากหลายบิล เช่น เงินสดที่ต้องมีในลิ้นชัก */
export function sumOfMethod(txs: PaidTransaction[], method: PaymentMethod) {
  return sumByMethod(txs)[method] ?? 0
}
