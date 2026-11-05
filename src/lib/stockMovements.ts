import type { StockMovementType } from '@/lib/types'

/**
 * ป้ายกำกับของการเคลื่อนไหวสต็อค — เดิมก๊อปอยู่ 2 ที่ (หน้าสินค้า + ประวัติสต็อค)
 * ย้ายมาไว้ที่เดียว เพิ่มประเภทใหม่แล้วทุกหน้าได้เหมือนกันหมด
 *
 * sign = ทิศทางของยอด (เก็บใน DB เป็นเลขบวกเสมอ ไม่มีเครื่องหมาย)
 */
export const MOVEMENT_LABEL: Record<
  StockMovementType,
  { text: string; className: string; sign: '+' | '-' }
> = {
  sale: { text: 'ขาย', className: 'bg-gray-100 text-gray-600', sign: '-' },
  receive: { text: 'รับเข้า', className: 'bg-green-100 text-green-700', sign: '+' },
  adjust_in: { text: 'ปรับเพิ่ม', className: 'bg-blue-100 text-blue-700', sign: '+' },
  adjust_out: { text: 'ปรับลด', className: 'bg-orange-100 text-orange-700', sign: '-' },
  cancel: { text: 'คืนจากยกเลิก', className: 'bg-purple-100 text-purple-700', sign: '+' },
}

export const IN_TYPES: StockMovementType[] = ['receive', 'adjust_in', 'cancel']
export const OUT_TYPES: StockMovementType[] = ['sale', 'adjust_out']

/** เหตุผลที่หน้าขายเขียนลงประวัติตอนกดปุ่ม "ตัดสต็อกออก" (ดู PaymentModal) */
export const WRITEOFF_PREFIX = 'ตัดสต็อกออก:'

/**
 * ใบนับสต็อกลงประวัติเป็น adjust_in/adjust_out เหมือนกัน แต่มีเอกสารของตัวเองอยู่แล้ว
 * ที่เมนู "นับสต็อก" — ไม่ต้องสร้างใบซ้ำในหน้าเอกสาร
 */
export function isStockCountReason(reason: string | null) {
  return !!reason && /^นับสต็อก\s/.test(reason)
}

/**
 * ช่วงเวลาที่ถือว่าเป็น "ใบเดียวกัน"
 *
 * การตัดสต็อกครั้งเดียวจากหน้าขายลง stock_movements หลายแถว (แถวละสินค้า/ล็อต) ห่างกันไม่กี่
 * ร้อยมิลลิวินาที แต่ไม่มีเลขใบผูกไว้ให้ — จึงจับกลุ่มจาก ประเภท + เหตุผล + คนทำ + เวลาที่
 * ไล่ติดกัน ถ้าแถวถัดไปห่างจากแถวก่อนหน้าในกลุ่มเกินช่วงนี้ ถือเป็นการตัดอีกครั้ง (ใบใหม่)
 */
export const DOC_GAP_MS = 5 * 60_000

export interface AdjustRow {
  id: string
  created_at: string
  type: StockMovementType
  quantity: number
  reason: string | null
  product_id: string
  products: { name: string; sku: string | null; unit: string } | null
  profiles: { name: string | null } | null
}

export interface AdjustDoc {
  /** ไอดีของแถวแรกในกลุ่ม — ใช้เป็นเลขอ้างอิงใบและคีย์ตอนเปิดหน้าพิมพ์ */
  id: string
  type: StockMovementType
  reason: string | null
  /** เหตุผลที่แคชเชียร์พิมพ์ไว้ ตัดคำว่า "ตัดสต็อกออก:" ออกแล้ว */
  note: string
  isWriteoff: boolean
  createdAt: string
  byName: string
  rows: AdjustRow[]
  totalQty: number
}

/** ตัดคำนำหน้าของเหตุผลออก เหลือแต่ข้อความที่คนพิมพ์เอง */
export function writeoffNote(reason: string | null) {
  if (!reason) return '—'
  return reason.startsWith(WRITEOFF_PREFIX) ? reason.slice(WRITEOFF_PREFIX.length).trim() || '—' : reason
}

/**
 * จับแถว stock_movements ที่มาจากการกดครั้งเดียวกันให้เป็นใบเดียว
 * รับแถวมาเรียงใหม่→เก่าหรือเก่า→ใหม่ก็ได้ คืนออกมาเรียงใหม่→เก่าเสมอ
 */
export function groupAdjustDocs(rows: AdjustRow[]): AdjustDoc[] {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const docs: AdjustDoc[] = []

  for (const row of sorted) {
    const last = docs[docs.length - 1]
    const sameAction =
      last &&
      last.type === row.type &&
      last.reason === row.reason &&
      last.rows[0].profiles?.name === row.profiles?.name &&
      // เทียบกับแถวที่เพิ่งใส่เข้ากลุ่ม ไม่ใช่แถวแรก — ใบที่มีของหลายสิบรายการจะยาวกว่า 5 นาทีได้
      new Date(last.rows[last.rows.length - 1].created_at).getTime() - new Date(row.created_at).getTime() <= DOC_GAP_MS

    if (sameAction) {
      last.rows.push(row)
      last.totalQty += row.quantity
      continue
    }

    docs.push({
      id: row.id,
      type: row.type,
      reason: row.reason,
      note: writeoffNote(row.reason),
      isWriteoff: !!row.reason?.startsWith(WRITEOFF_PREFIX),
      createdAt: row.created_at,
      byName: row.profiles?.name ?? '—',
      rows: [row],
      totalQty: row.quantity,
    })
  }

  return docs
}
