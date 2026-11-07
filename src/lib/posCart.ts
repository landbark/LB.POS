import type { CartItem, ClinicQueueVisit, Customer } from './types'

/**
 * ตะกร้าหน้าขายที่ค้างไว้ — เก็บที่เครื่อง ไม่ใช่ที่บัญชี
 *
 * ตะกร้าเดิมอยู่ใน state ของหน้าเท่านั้น พอเดินออกจาก /pos ไปคีย์ใบตรวจของสัตว์ตัวถัดไป
 * แล้วกลับมา ของที่ยิง/คีย์ไว้ก่อนหน้าหายหมด (เคสจริง: ดึงใบแมวตัวแรก เติมอาหารไต
 * แล้วกลับไปคีย์ใบอีกสองตัวที่หน้าคลินิก พอกลับมาเหลือแต่ของจากคลินิก ต้องคีย์อาหารไตใหม่)
 * เผลอรีเฟรช หรือแท็บโดนเบราว์เซอร์ทิ้งตอนสลับแอปบนแท็บเล็ต ก็หายแบบเดียวกัน
 */
const KEY = 'pos-cart'

/** ตะกร้าข้ามวันไม่มีความหมาย — ราคา/สต็อคขยับไปแล้ว และคนที่มาเปิดเครื่องเช้าก็ไม่ใช่บิลเดิม */
const MAX_AGE_MS = 12 * 60 * 60 * 1000

export interface SavedCart {
  cart: CartItem[]
  activeVisits: ClinicQueueVisit[]
  customer: Customer | null
  customerPhone: string
  /** รอบออกบูธ ณ ตอนเก็บ — ราคาในตะกร้าเป็นราคาของโหมดนั้น คนละโหมดห้ามกู้คืน */
  boothTrip: string | null
  /** คนละคนล็อกอินบนเครื่องเดียวกัน ไม่ควรรับตะกร้าของอีกคนมาเก็บเงินต่อ */
  cashierId: string
}

export function saveCart(state: SavedCart) {
  try {
    // ตะกร้าว่าง = ไม่มีอะไรให้กู้ และต้องลบของเก่าทิ้งด้วย ไม่งั้นบิลที่จ่ายไปแล้วจะย้อนกลับมา
    if (state.cart.length === 0) {
      localStorage.removeItem(KEY)
      return
    }
    localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }))
  } catch {
    // โหมดส่วนตัว / พื้นที่เต็ม — ไม่ใช่เรื่องที่ต้องหยุดการขาย
  }
}

export function clearSavedCart() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // เหมือนกัน — ล้างไม่ได้ก็ไม่เป็นไร เดี๋ยวก็หมดอายุเอง
  }
}

/** ตะกร้าที่ค้างไว้ของคนนี้บนเครื่องนี้ — คนละคน คนละโหมด หรือเก่าเกินครึ่งวัน ถือว่าไม่มี */
export function loadSavedCart(cashierId: string, boothTrip: string | null): SavedCart | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as SavedCart & { savedAt?: number }
    if (!Array.isArray(saved.cart) || saved.cart.length === 0) return null
    if (saved.cashierId !== cashierId) return null
    if ((saved.boothTrip ?? null) !== boothTrip) return null
    if (!saved.savedAt || Date.now() - saved.savedAt > MAX_AGE_MS) {
      clearSavedCart()
      return null
    }
    return saved
  } catch {
    // ของเก่าคนละรูปแบบ อ่านไม่ออกก็ทิ้งไป ดีกว่าหน้าขายพังทั้งหน้า
    clearSavedCart()
    return null
  }
}
