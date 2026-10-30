import type { PaymentMethod, SalesChannel } from '@/lib/types'

export interface ReceiptTx {
  id: string
  transaction_number: string
  /** วันที่ขายจริง — บิลย้อนหลังคือวันที่เน็ตล่ม ใบเสร็จพิมพ์วันนี้ */
  created_at: string
  /** เวลาที่คีย์เข้าระบบ · null = คีย์ตอนขาย (ดู lib/backdate) */
  recorded_at?: string | null
  subtotal: number
  discount: number
  total: number
  status: 'completed' | 'cancelled'
  rounding: number | null
  payment_method: PaymentMethod
  sales_channel: SalesChannel | null
  external_order_no: string | null
  cash_received: number | null
  transaction_payments?: { method: PaymentMethod; amount: number }[] | null
  change_given: number | null
  points_earned: number
  points_used: number
  credit_used: number
  customers: { name: string; phone: string; hn: string | null } | null
  profiles: { name: string } | null
  transaction_items: {
    quantity: number
    unit_price: number
    discount: number
    subtotal: number
    /** ชื่อหน่วยที่ขาย (null = หน่วยฐานของสินค้า) */
    unit_name: string | null
    unit_factor: number
    base_quantity: number
    products: { name: string; unit: string; sku: string | null } | null
  }[]
}

export type PaperSize = '80mm' | 'a4' | 'a5'

export const PAPER_CONFIG: Record<PaperSize, { page: string; margin: string; width: string; font: string; pad: string }> = {
  '80mm': { page: '80mm auto', margin: '2mm 3mm', width: '300px', font: '12px', pad: 'p-4' },
  // A4/A5 ใช้ความกว้าง/ระยะขอบชุดเดียวกับใบสั่งซื้อ เอกสารของร้านจะได้หน้าตาเป็นชุดเดียวกัน
  a4: { page: 'A4', margin: '15mm', width: '650px', font: '14px', pad: 'p-8' },
  // A5 แคบกว่ามาก ขอบหนาเท่า A4 จะกินที่ตารางจนชื่อสินค้าแตกบรรทัด
  a5: { page: 'A5', margin: '10mm', width: '480px', font: '13px', pad: 'p-5' },
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  card: 'บัตรเครดิต',
  qr: 'QR Code',
}

export const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
