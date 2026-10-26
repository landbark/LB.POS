import type { Product } from '@/lib/types'

/**
 * งานออกบูธ — ร้านยกของไปขายนอกสถานที่เดือนละครั้ง ราคาบางตัวคนละราคากับหน้าร้าน
 *
 * ของที่ยกไป **ไม่ถูกตัดสต็อกตอนเบิก** — ขายได้ค่อยตัดแบบ FEFO เหมือนขายหน้าร้าน
 * ตอนปิดรอบถึงเอา (เอาไป − ขายได้ − คืน) มาตัดเป็นของหาย ดู closeBoothTrip()
 */

/** ราคาที่ใช้ขายที่บูธ — ไม่ได้ตั้งไว้ก็ใช้ราคาปกติ */
export const boothPrice = (p: Pick<Product, 'price' | 'booth_price'>) =>
  p.booth_price ?? p.price

/** ตั้งราคาบูธไว้ต่างจากหน้าร้านจริงๆ (เท่ากันเป๊ะถือว่าไม่ต่าง ไม่ต้องขึ้นป้าย) */
export const hasBoothPrice = (p: Pick<Product, 'price' | 'booth_price'>) =>
  p.booth_price != null && p.booth_price !== p.price

/**
 * สลับราคาทั้งก้อนเป็นราคาบูธ
 *
 * เปลี่ยนที่ `price` เลยแทนที่จะไปแก้ทุกจุดที่อ่านราคาในหน้าขาย (กริด, ตะกร้า, โปรโมชั่น,
 * จอลูกค้า) — จุดเดียวพลาดแล้วลูกค้าจ่ายราคาผิด
 */
export const withBoothPrices = <T extends Pick<Product, 'price' | 'booth_price'>>(products: T[]) =>
  products.map((p) => (p.booth_price == null ? p : { ...p, price: p.booth_price }))

/**
 * รอบออกบูธที่ "เครื่องนี้" กำลังขายอยู่ — จำไว้ใน localStorage ให้รีเฟรชแล้วยังอยู่โหมดเดิม
 *
 * เก็บเป็น external store แทน useState + useEffect เพราะค่าอยู่นอก React
 * (อ่านตอน render ตรงๆ ไม่ได้ ฝั่ง server ไม่มี localStorage แล้ว html จะไม่ตรงกัน)
 */
const BOOTH_TRIP_KEY = 'lb_booth_trip'

// โหมดส่วนตัว/ปิดคุกกี้เขียนไม่ได้ — เก็บในหน่วยความจำแทน ใช้ได้ปกติ แค่หายตอนรีเฟรช
let boothTripFallback: string | null = null
const boothTripListeners = new Set<() => void>()

export function getBoothTrip(): string | null {
  try {
    return localStorage.getItem(BOOTH_TRIP_KEY)
  } catch {
    return boothTripFallback
  }
}

/** ฝั่ง server ไม่มีเครื่องให้จำ — เริ่มที่ "ไม่ได้อยู่โหมดบูธ" เสมอ */
export const getBoothTripOnServer = () => null

export function setBoothTrip(tripId: string | null) {
  try {
    if (tripId) localStorage.setItem(BOOTH_TRIP_KEY, tripId)
    else localStorage.removeItem(BOOTH_TRIP_KEY)
  } catch {
    /* เขียนไม่ได้ก็ยังขายต่อได้ — ค่าอยู่ใน boothTripFallback */
  }
  boothTripFallback = tripId
  boothTripListeners.forEach((notify) => notify())
}

export function subscribeBoothTrip(onChange: () => void) {
  boothTripListeners.add(onChange)
  return () => {
    boothTripListeners.delete(onChange)
  }
}

export interface BoothLine {
  taken: number
  /** ขายได้จากบิลในรอบนี้ */
  sold: number
  /** กรอกในใบคืน (null = ยังไม่ได้กรอก) */
  returned: number | null
}

/** ควรเหลือกลับเท่าไร = เอาไป − ขายได้ (ติดลบได้ถ้าขายเกินที่เบิก เช่น หยิบเพิ่มทีหลัง) */
export const shouldReturn = (line: BoothLine) => line.taken - line.sold

/**
 * ของที่หายไป = ควรเหลือ − คืนจริง
 *
 * ค่าบวก = หาย (ตัดสต็อกออก), ค่าลบ = คืนมากกว่าที่ควร (เอาไปเพิ่มโดยไม่ได้ลงใบเบิก) ไม่ตัดอะไร
 */
export const missingQty = (line: BoothLine) =>
  line.returned == null ? 0 : Math.max(0, shouldReturn(line) - line.returned)
