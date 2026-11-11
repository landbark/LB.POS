// เงินสดในเก๊ะของกะหนึ่ง — คิดจาก "เงินเข้า-ออกเก๊ะตามเวลาที่เกิด" ไม่ใช่ตามสถานะบิลตอนนี้
//
// บิลที่ขายเป็นเงินสดแล้วถูกยกเลิกทีหลัง เงินเข้าเก๊ะไปแล้วตอนขาย — ถ้านับแต่บิล
// `status = 'completed'` บิลนั้นจะหายจากฝั่งเงินเข้า แต่ยอดคืนเงินสดยังถูกหักอยู่
// เท่ากับหักสองเด้ง เงินที่ควรมีจึงต่ำกว่าความจริงเท่ายอดบิลนั้น (เจอ 2026-10-25)
//
// กฎที่ถูกคือ: ขายเมื่อไหร่เงินเข้าเมื่อนั้น · ยกเลิกคืนเงินสดเมื่อไหร่เงินออกเมื่อนั้น
// ขายกะนี้แล้วยกเลิกกะนี้ = เข้าแล้วออก สุทธิศูนย์ · ขายกะก่อนแล้วมายกเลิกกะนี้ = ออกอย่างเดียว

import { paymentLines, sumByMethod, type PaidTransaction } from '@/lib/payments'

/** บิลที่ select มาพร้อม `status` (ไม่กรอง `status` ใน query แล้ว จะได้เห็นบิลที่ยกเลิกไปด้วย) */
export type ShiftBill = PaidTransaction & { status: string }

export interface ShiftBillSplit {
  /** ยอดขายแยกตามวิธีจ่าย เฉพาะบิลที่ยังไม่ถูกยกเลิก — ตัวเลข "ยอดขาย" ที่โชว์ในสรุปกะ */
  byMethod: Record<string, number>
  /** จำนวนบิลของแต่ละวิธีจ่าย (บิลที่แยกจ่ายนับเข้าทุกทางที่รับมา) */
  countByMethod: Record<string, number>
  /** ยอดขายรวมของบิลที่ยังไม่ถูกยกเลิก */
  salesTotal: number
  /** จำนวนบิลที่ยังไม่ถูกยกเลิก */
  bills: number
  /** เงินสดที่รับไว้จากบิลที่ขายในกะนี้แล้วถูกยกเลิกทีหลัง (เงินเข้าเก๊ะไปแล้ว) */
  cashFromCancelled: number
  /** จำนวนบิลในกะที่ถูกยกเลิกไปแล้ว */
  cancelledBills: number
}

export function splitShiftBills(bills: ShiftBill[]): ShiftBillSplit {
  const cancelled = bills.filter((b) => b.status === 'cancelled')
  const live = bills.filter((b) => b.status !== 'cancelled')
  const countByMethod: Record<string, number> = {}
  for (const b of live) {
    for (const line of paymentLines(b)) {
      countByMethod[line.method] = (countByMethod[line.method] ?? 0) + 1
    }
  }
  return {
    byMethod: sumByMethod(live),
    countByMethod,
    salesTotal: live.reduce((s, b) => s + Number(b.total), 0),
    bills: live.length,
    cashFromCancelled: sumByMethod(cancelled).cash ?? 0,
    cancelledBills: cancelled.length,
  }
}

/** เงินสดที่ควรมีในลิ้นชักตอนนี้ — ขายเมื่อไหร่เงินเข้าเมื่อนั้น คืนเมื่อไหร่เงินออกเมื่อนั้น */
export function expectedCash(p: {
  openingCash: number
  /** ขายเงินสดในกะ (บิลที่ยังไม่ถูกยกเลิก) */
  cashSales: number
  /** เงินสดจากบิลในกะที่ถูกยกเลิกทีหลัง — รับไว้แล้วตอนขาย */
  cashFromCancelled: number
  /** เงินสดที่คืนลูกค้าจากใบเสร็จที่ยกเลิกในช่วงกะนี้ */
  cashRefunds: number
  /**
   * เงินสดที่คืนลูกค้าจากใบคืน/เปลี่ยนสินค้าในช่วงกะนี้ (ดู src/lib/returns.ts)
   *
   * บิลเปลี่ยนสินค้าไม่ต้องคิดแยก — ยอดที่เก็บเพิ่มเป็นบิลขายปกติเข้า cashSales เอง
   * ส่วนที่ต้องหักคือเงินที่จ่ายคืนออกจากเก๊ะจริง (ของใหม่ถูกกว่า หรือคืนของล้วน)
   */
  cashReturnRefunds?: number
  cashIn: number
  cashOut: number
}) {
  return (
    p.openingCash +
    p.cashSales +
    p.cashFromCancelled -
    p.cashRefunds -
    (p.cashReturnRefunds ?? 0) +
    p.cashIn -
    p.cashOut
  )
}

/**
 * เงินครบไหมเมื่อรวมทั้งเก๊ะและบัญชี
 *
 * บิลที่รับเงินสดแต่กดว่าโอน ทำให้เงินที่ควรมีในเก๊ะต่ำไปเท่ายอดบิลนั้น พอนับจริงเลยขึ้นว่า "เกิน"
 * แล้วยอดที่ควรเข้าบัญชีก็สูงไปเท่ากัน เช็คจากแอปแล้วขึ้นว่า "ขาด" — สองฝั่งไม่ตรงทั้งคู่
 * ทั้งที่เงินไม่ได้หายไปสักบาท กดผิดช่องทางเฉย ๆ
 *
 * เทียบยอดรวมสองฝั่งจึงตอบได้ว่าเงินหายจริงไหม: รวมแล้วเป็นศูนย์ = ครบ แค่ลงผิดทาง
 */
export function checkChannels(cashDiff: number, bankDiff: number) {
  const total = cashDiff + bankDiff
  const matched = Math.abs(total) < 0.005
  return {
    total,
    /** เงินรวมครบ แต่ลงช่องทางผิดอยู่เท่านี้ · 0 = ไม่ใช่กรณีนี้ */
    swapped: matched && Math.abs(cashDiff) >= 0.005 ? Math.abs(cashDiff) : 0,
    /** รวมสองฝั่งแล้วครบพอดี */
    matched,
  }
}
