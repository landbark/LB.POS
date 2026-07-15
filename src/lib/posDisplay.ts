import type { PaymentMethod } from '@/lib/types'

// ชื่อ BroadcastChannel ที่ใช้ส่งข้อมูลระหว่างหน้าขาย (แคชเชียร์) กับจอลูกค้า (จอสอง) — ต้องเปิดจาก origin เดียวกัน
export const POS_DISPLAY_CHANNEL = 'landbark-pos-display'

export interface DisplayCustomer {
  name: string
  pointsBefore: number
  pointsEarned: number
  pointsAfter: number
}

export type PosDisplayMessage =
  | {
      stage: 'cart'
      items: { name: string; unit: string; quantity: number; unitPrice: number; subtotal: number }[]
      subtotal: number
      discount: number
      total: number
      customer: DisplayCustomer | null
    }
  | {
      stage: 'payment'
      subtotal: number
      discount: number
      total: number
      method: Exclude<PaymentMethod, 'qr'>
      promptpayId: string | null
      customer: DisplayCustomer | null
    }
  | {
      stage: 'done'
      total: number
      customer: DisplayCustomer | null
    }
