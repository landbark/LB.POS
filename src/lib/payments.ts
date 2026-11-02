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

/** ชื่อไทยของแต่ละช่องทางรับเงิน — ใช้ร่วมกันทุกหน้า */
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  card: 'บัตรเครดิต',
  qr: 'QR Code',
}

// สีประจำช่องทางรับเงิน — เขียว = เงินสด (เข้าเก๊ะ) · น้ำเงิน/ฟ้า = เข้าบัญชี · ม่วง = ผ่านเครื่องรูดบัตร
// แยกสีไว้เพราะหน้าเอกสารดูทีละร้อยแถว อ่านเป็นตัวหนังสือล้วนแล้วหาบิลที่รับเงินผิดทางไม่เจอ
export const PAYMENT_BADGE: Record<PaymentMethod, string> = {
  cash: 'bg-emerald-100 text-emerald-700',
  transfer: 'bg-blue-100 text-blue-700',
  card: 'bg-violet-100 text-violet-700',
  qr: 'bg-cyan-100 text-cyan-700',
}

/** จุดสีเล็ก ๆ หน้าชื่อช่องทาง (ใช้ในสรุปที่ไม่มีที่พอให้ใส่ badge เต็ม) */
export const PAYMENT_DOT: Record<PaymentMethod, string> = {
  cash: 'bg-emerald-500',
  transfer: 'bg-blue-500',
  card: 'bg-violet-500',
  qr: 'bg-cyan-500',
}

/**
 * ช่องทางที่เงินเข้าบัญชีร้าน ไม่ได้เข้าเก๊ะ — QR ของร้านผูกกับบัญชีเดียวกับที่ลูกค้าโอนมา
 * เงินสองก้อนนี้จึงเช็คจากแอปธนาคารก้อนเดียวกันตอนปิดกะ (บัตรเครดิตเข้าทีหลังเป็นรอบ ไม่นับ)
 */
export const BANK_METHODS: PaymentMethod[] = ['transfer', 'qr']

/** ยอดที่ควรเข้าบัญชีจากบิลชุดหนึ่ง = โอน + QR */
export function sumBankMethods(byMethod: Record<string, number>) {
  return BANK_METHODS.reduce((s, m) => s + (byMethod[m] ?? 0), 0)
}

/** บัญชีที่ให้กรอกตอนปิดกะ ถ้าร้านยังไม่ได้ตั้งเอง — K SHOP เป็นหลัก ถุงเงินใช้กับไทยช่วยไทยพลัส */
export const DEFAULT_TRANSFER_ACCOUNTS = ['K SHOP', 'ถุงเงิน']
