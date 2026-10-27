// สิทธิ์ตาม role — รวมไว้ที่เดียวเพราะมีคนเช็คหลายจุด (proxy, เมนู, หน้าเวชระเบียน)
//
// 'vet'      = สัตวแพทย์ — งานคลินิก + ดูสินค้า/สต็อค/ลูกค้า แต่ไม่ยุ่งกับการขาย/จัดซื้อ/เงิน
// 'vet_plus' = สัตวแพทย์พิเศษ — เหมือน vet แต่ดูรายงาน / เอกสาร / สรุปรายวัน ได้ด้วย

/** หน้าที่ปลดล็อกให้ "สัตวแพทย์พิเศษ" เพิ่มจากสัตวแพทย์ทั่วไป */
export const VET_PLUS_PATHS = ['/admin/reports', '/admin/documents', '/admin/daily']

/** หมอทุกแบบ — ใช้ตรงที่เงื่อนไขเดิมเขียนว่า role === 'vet' */
export function isVet(role?: string | null): boolean {
  return role === 'vet' || role === 'vet_plus'
}

/** ตรวจรักษา / แก้เวชระเบียน / จัดการชื่อโรคได้ */
export function canExamine(role?: string | null): boolean {
  return role === 'admin' || isVet(role)
}

/** หน้าที่เปิดให้เฉพาะสัตวแพทย์พิเศษ (นอกเหนือจากสิทธิ์หมอทั่วไป) */
export function isVetPlusPath(pathname: string): boolean {
  return VET_PLUS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}
