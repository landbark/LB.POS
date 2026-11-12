/**
 * บัตรสมาชิก = QR ที่ลูกค้าเปิดจากหน้า /account แล้วให้พนักงานยิงที่หน้าขาย
 *
 * ข้างในเก็บ id ของลูกค้า ไม่ใช่เบอร์โทร — ใครถ่ายรูปจอไปก็ไม่ได้เบอร์ติดไปด้วย
 * และลูกค้าเปลี่ยนเบอร์แล้วบัตรใบเดิมยังใช้ได้
 *
 * คำนำหน้า LBM- มีไว้ให้หน้าขายแยกออกจากบาร์โค้ดสินค้าได้ทันที
 * (บาร์โค้ดจริงบนกล่องเป็น EAN/UPC = ตัวเลขล้วน จึงไม่มีทางชนกัน)
 */
export const MEMBER_CODE_PREFIX = 'LBM-'

const MEMBER_CODE_RE = /LBM-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function memberCode(customerId: string): string {
  return MEMBER_CODE_PREFIX + customerId
}

/**
 * อ่านรหัสสมาชิกจากท้ายข้อความที่ยิงเข้ามา
 *
 * คืนข้อความที่ค้างอยู่ก่อนหน้าด้วย เพราะเครื่องยิงพ่นต่อท้ายคำค้นที่พิมพ์ค้างไว้ได้
 * (เหมือนที่ findScannedCode ทำกับบาร์โค้ดสินค้า) — ยิงแล้วคำค้นเดิมต้องไม่หาย
 */
export function parseMemberCode(text: string): { id: string; before: string } | null {
  const m = text.match(MEMBER_CODE_RE)
  if (!m || m.index === undefined) return null
  return { id: m[1].toLowerCase(), before: text.slice(0, m.index).trim() }
}
