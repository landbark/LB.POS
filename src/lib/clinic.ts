// ของคลินิก (ยา/เวชภัณฑ์) — ตั้งค่าตั้งต้นที่หมวดหมู่ แล้วแก้รายตัวได้ เหมือน vat_applicable
//
// สินค้าที่เป็นของคลินิกจะไม่ขึ้นในหน้าขาย — จ่ายได้จากหน้าตรวจรักษาเท่านั้น
// แล้วค่อยถูกส่งเข้าตะกร้า POS ให้แคชเชียร์เก็บเงิน (สต็อคตัดตอนจ่ายเงินเหมือนเดิม)

interface ClinicProduct {
  clinic_only?: boolean | null
  categories?: { clinic_only?: boolean | null } | null
}

/** สินค้าตัวนี้เป็นของคลินิกไหม — ค่ารายสินค้าชนะค่าของหมวด, ไม่ตั้งอะไรเลย = ขายหน้าร้านได้ตามปกติ */
export function isClinicOnly(product: ClinicProduct): boolean {
  if (product.clinic_only !== null && product.clinic_only !== undefined) {
    return product.clinic_only
  }
  return product.categories?.clinic_only ?? false
}
