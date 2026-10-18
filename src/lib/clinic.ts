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

interface VaccineProduct {
  is_vaccine?: boolean | null
  categories?: { is_vaccine?: boolean | null } | null
}

/**
 * ยาฉีดที่คิดราคาตามปริมาตรไหม — ดูที่หน่วยขาย (ml. / cc. / มล.)
 * หมอฉีดเป็นเศษ ml ได้ แต่บิลคิดเป็น ml เต็ม ปัดขึ้น ขั้นต่ำ 1 ml
 */
export function isVolumeDosed(product: { unit?: string | null }): boolean {
  return /^(ml|cc|มล)\.?$/i.test((product.unit ?? '').trim())
}

/** ml ที่คิดเงินจากที่ฉีดจริง — ต่ำกว่า 1 ml คิด 1 ml, เกินกว่านั้นปัดขึ้นเป็นเลขเต็ม */
export function billedMl(doseMl: number): number {
  return Math.max(1, Math.ceil(doseMl))
}

/** สินค้าตัวนี้เป็นวัคซีนไหม — ค่ารายสินค้าชนะค่าของหมวด (จ่ายแล้วลงประวัติวัคซีนอัตโนมัติ) */
export function isVaccine(product: VaccineProduct): boolean {
  if (product.is_vaccine !== null && product.is_vaccine !== undefined) {
    return product.is_vaccine
  }
  return product.categories?.is_vaccine ?? false
}
