/**
 * ค่าที่ใช้ร่วมกันระหว่างหน้าสต็อค (server) กับ CategoryFilter (client)
 *
 * ต้องอยู่ในไฟล์ธรรมดาแบบนี้ ห้ามย้ายไปไว้ใน CategoryFilter.tsx — ของที่ export ออกมาจาก
 * ไฟล์ 'use client' เวลา server component import ไป จะไม่ได้ค่าจริง แต่ได้ client reference
 * proxy มาแทน (เห็นได้ใน .next/server/chunks/ssr/...inventory...js) เทียบ === กับสตริงแล้ว
 * ไม่มีวันตรง — ตัวกรองจะเงียบๆ ไม่ทำงานโดยไม่มี error ให้เห็น
 */

/** ค่าพิเศษของ ?cat= ที่ไม่ใช่ id ของหมวด */
export const CAT_CLINIC = 'clinic'
export const CAT_SHOP = 'shop'
export const CAT_NONE = 'none'

export interface CategoryOption {
  id: string
  name: string
  clinic_only: boolean
}
