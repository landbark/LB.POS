// เงินสดในเก๊ะของกะหนึ่ง — คิดจาก "เงินเข้า-ออกเก๊ะตามเวลาที่เกิด" ไม่ใช่ตามสถานะบิลตอนนี้
//
// บิลที่ขายเป็นเงินสดแล้วถูกยกเลิกทีหลัง เงินเข้าเก๊ะไปแล้วตอนขาย — ถ้านับแต่บิล
// `status = 'completed'` บิลนั้นจะหายจากฝั่งเงินเข้า แต่ยอดคืนเงินสดยังถูกหักอยู่
// เท่ากับหักสองเด้ง เงินที่ควรมีจึงต่ำกว่าความจริงเท่ายอดบิลนั้น (เจอ 2026-10-25)
//
// กฎที่ถูกคือ: ขายเมื่อไหร่เงินเข้าเมื่อนั้น · ยกเลิกคืนเงินสดเมื่อไหร่เงินออกเมื่อนั้น
// ขายกะนี้แล้วยกเลิกกะนี้ = เข้าแล้วออก สุทธิศูนย์ · ขายกะก่อนแล้วมายกเลิกกะนี้ = ออกอย่างเดียว

import { sumByMethod, type PaidTransaction } from '@/lib/payments'

/** บิลที่ select มาพร้อม `status` (ไม่กรอง `status` ใน query แล้ว จะได้เห็นบิลที่ยกเลิกไปด้วย) */
export type ShiftBill = PaidTransaction & { status: string }

export interface ShiftBillSplit {
  /** ยอดขายแยกตามวิธีจ่าย เฉพาะบิลที่ยังไม่ถูกยกเลิก — ตัวเลข "ยอดขาย" ที่โชว์ในสรุปกะ */
  byMethod: Record<string, number>
  /** เงินสดที่รับไว้จากบิลที่ขายในกะนี้แล้วถูกยกเลิกทีหลัง (เงินเข้าเก๊ะไปแล้ว) */
  cashFromCancelled: number
  /** จำนวนบิลในกะที่ถูกยกเลิกไปแล้ว */
  cancelledBills: number
}

export function splitShiftBills(bills: ShiftBill[]): ShiftBillSplit {
  const cancelled = bills.filter((b) => b.status === 'cancelled')
  return {
    byMethod: sumByMethod(bills.filter((b) => b.status !== 'cancelled')),
    cashFromCancelled: sumByMethod(cancelled).cash ?? 0,
    cancelledBills: cancelled.length,
  }
}

/** เงินสดที่ควรมีในลิ้นชักตอนนี้ */
export function expectedCash(p: {
  openingCash: number
  /** ขายเงินสดในกะ (บิลที่ยังไม่ถูกยกเลิก) */
  cashSales: number
  /** เงินสดจากบิลในกะที่ถูกยกเลิกทีหลัง — รับไว้แล้วตอนขาย */
  cashFromCancelled: number
  /** เงินสดที่คืนลูกค้าจากใบเสร็จที่ยกเลิกในช่วงกะนี้ */
  cashRefunds: number
  cashIn: number
  cashOut: number
}) {
  return p.openingCash + p.cashSales + p.cashFromCancelled - p.cashRefunds + p.cashIn - p.cashOut
}
