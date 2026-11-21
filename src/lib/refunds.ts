// ช่องทางคืนเงิน — รวมป้ายชื่อกับตัวเลือกไว้ที่เดียว เพราะมีทั้งหน้ายกเลิกบิล หน้ารับคืนของ
// ทะเบียนเอกสาร และข้อความแจ้งเตือน Telegram ที่ต้องเรียกชื่อช่องทางเดียวกันทั้งหมด
//
// กฎของร้าน: คืนทางเดียวกับที่ลูกค้าจ่ายมา — รูดบัตรก็ยกเลิกรายการที่เครื่องรูด โอนมาก็โอนคืน
// ควักเงินสดคืนบิลที่จ่ายบัตรจะทำให้สรุปกะหักเงินออกจากเก๊ะทั้งที่เงินไม่ได้ออกจากเก๊ะจริง

import type { PaymentMethod, RefundMethod } from '@/lib/types'
import { PAYMENT_LABEL } from '@/lib/payments'

/** ชื่อช่องทางคืนเงินแบบอ่านเดี่ยว ๆ ได้ — ใช้ในตาราง/ใบเสร็จ/ข้อความแจ้งเตือน */
export const REFUND_LABEL: Record<RefundMethod, string> = {
  cash: 'คืนเงินสด',
  transfer: 'คืนโดยโอน',
  card: 'คืนเข้าบัตร',
  qr: 'คืนเข้า QR',
  credit: 'เก็บเป็นเครดิต',
}

/** ตัวเลือกในหน้ายกเลิกบิล / รับคืนของ — เรียงตามที่ใช้บ่อย เครดิตไว้ท้ายสุดเพราะไม่ใช่เงินออก */
export const REFUND_OPTIONS: { value: RefundMethod; label: string; hint?: string }[] = [
  { value: 'cash', label: 'เงินสด', hint: 'ควักจากเก๊ะ' },
  { value: 'transfer', label: 'โอนเงินคืน', hint: 'เงินออกจากบัญชีร้าน' },
  { value: 'card', label: 'ยกเลิกรายการบัตร', hint: 'ทำที่เครื่องรูด เงินไม่ออกจากเก๊ะ' },
  { value: 'qr', label: 'คืนเข้า QR / พร้อมเพย์', hint: 'เงินออกจากบัญชีร้าน' },
  { value: 'credit', label: 'เก็บเป็นเครดิตร้าน', hint: 'สมาชิกเท่านั้น · ไม่มีเงินออก' },
]

/**
 * ช่องทางที่ "ควรจะ" คืน จากวิธีที่ลูกค้าจ่ายมา — ทุกวิธีรับเงินมีช่องคืนที่ตรงกันอยู่แล้ว
 * (บิลแยกจ่ายหลายทางเดาให้ไม่ได้ ให้คนกดเลือกเอง — ดู isSplitPayment)
 */
export function suggestedRefundMethod(payment: PaymentMethod): RefundMethod {
  return payment
}

/** คืนคนละทางกับที่รับเงินมาไหม — ทำได้ แต่ต้องเตือนให้เห็นก่อนกดยืนยัน */
export function isRefundMismatch(payment: PaymentMethod, refund: RefundMethod): boolean {
  return refund !== 'credit' && refund !== payment
}

/** ข้อความเตือนตอนเลือกคืนคนละทางกับที่จ่ายมา */
export function refundMismatchWarning(payment: PaymentMethod, refund: RefundMethod): string {
  const paid = PAYMENT_LABEL[payment] ?? payment
  const back = REFUND_LABEL[refund] ?? refund
  return `บิลนี้ลูกค้าจ่ายมาเป็น${paid} แต่กำลังจะ${back} — ถ้าไม่ได้คืนทางนี้จริง สรุปกะจะไม่ตรง`
}

/** เงินออกจากเก๊ะจริงไหม — มีแต่เงินสดเท่านั้นที่กระทบยอดเงินในลิ้นชักตอนปิดกะ */
export function isCashOut(refund: RefundMethod | null): boolean {
  return refund === 'cash'
}
