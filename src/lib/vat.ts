// VAT ของสินค้า — ตั้งค่าตั้งต้นที่หมวดหมู่ แล้วแก้รายตัวได้
//
// สำคัญ: ตอนนี้ร้านยังไม่ได้จดทะเบียน VAT ค่าพวกนี้จึง "เก็บข้อมูลไว้เฉยๆ"
// ไม่มีการบวก VAT เข้าราคาขาย และไม่พิมพ์ VAT ลงใบเสร็จ จนกว่าจะเปิด
// store_settings.vat_registered (ออกใบกำกับภาษีทั้งที่ยังไม่จดทะเบียนผิดกฎหมาย)

interface VatProduct {
  vat_applicable?: boolean | null
  categories?: { vat_applicable?: boolean | null } | null
}

/** สินค้าตัวนี้เข้าข่าย VAT ไหม — ค่ารายสินค้าชนะค่าของหมวด, ไม่ตั้งอะไรเลย = ไม่มี VAT */
export function isVatApplicable(product: VatProduct): boolean {
  if (product.vat_applicable !== null && product.vat_applicable !== undefined) {
    return product.vat_applicable
  }
  return product.categories?.vat_applicable ?? false
}

/** ราคาที่ตั้งไว้ในระบบเป็นราคาก่อน VAT — แยกยอดฐานกับ VAT ออกจากยอดขาย */
export function splitVat(amountBeforeVat: number, rate: number) {
  const vat = amountBeforeVat * (rate / 100)
  return { base: amountBeforeVat, vat, total: amountBeforeVat + vat }
}
