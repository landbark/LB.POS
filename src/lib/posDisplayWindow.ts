/**
 * เปิดจอลูกค้า (/pos-display) ไปที่จอที่สองแล้วขยายเต็มจอให้เลย
 *
 * เดิมเปิดเป็นหน้าต่างเล็กทับจอเดิม พนักงานต้องลากไปจออีกใบ + กดเต็มจอเอง ซึ่งไม่ค่อยมีใครทำ
 *
 * ใช้ Window Management API (`getScreenDetails`) ที่ต้องขออนุญาตครั้งแรกครั้งเดียว
 * ("จัดการหน้าต่างบนจอทั้งหมด") — เบราว์เซอร์ที่ไม่มี API นี้ (Firefox/Safari) หรือเครื่องที่ต่อจอเดียว
 * จะถอยไปเปิดแบบเดิม ไม่พัง
 */

const WINDOW_NAME = 'landbark-customer-display'
/** จำว่าเคยได้สิทธิ์แล้ว — รอบต่อไปจะรู้พิกัดจอก่อนเปิด ไม่ต้องเปิดแล้วค่อยย้าย */
const READY_KEY = 'lb_display_ready'
/** จำว่าใช้จอไหน เผื่อต่อหลายจอ */
const SCREEN_KEY = 'lb_display_screen'

interface ScreenDetailed {
  availLeft: number
  availTop: number
  availWidth: number
  availHeight: number
  isPrimary: boolean
  label: string
}

interface ScreenDetails {
  screens: ScreenDetailed[]
  currentScreen: ScreenDetailed
}

type WindowWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> }
/** `isExtended` ยังไม่อยู่ใน TS lib — อ่านได้โดยไม่ต้องขอสิทธิ์ บอกแค่ว่าต่อหลายจออยู่ไหม */
type ScreenMaybeExtended = Screen & { isExtended?: boolean }

let displayWindow: Window | null = null

const remember = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch { /* โหมดส่วนตัว — ข้ามไป */ }
}
const recall = (key: string) => {
  try { return localStorage.getItem(key) } catch { return null }
}

/** จอที่ "ไม่ใช่จอที่หน้าขายเปิดอยู่" — คืน null ถ้าไม่มี API / ต่อจอเดียว / ไม่ให้สิทธิ์ */
async function pickScreen(): Promise<ScreenDetailed | null> {
  const getScreenDetails = (window as WindowWithScreens).getScreenDetails
  if (typeof getScreenDetails !== 'function') return null
  try {
    // กล่องขออนุญาตค้างได้นานถ้าไม่มีใครกด — อย่าให้ปุ่มค้างรอตลอดไป
    const details = await Promise.race([
      getScreenDetails.call(window),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
    ])
    if (!details) return null

    // เทียบด้วยพิกัด ไม่ใช่ชื่อ — จอรุ่นเดียวกันสองใบได้ label เหมือนกัน
    const cur = details.currentScreen
    const others = details.screens.filter(
      (s) => s.availLeft !== cur.availLeft || s.availTop !== cur.availTop,
    )
    if (others.length === 0) return null
    remember(READY_KEY, '1')

    const last = recall(SCREEN_KEY)
    const chosen = others.find((s) => s.label === last) ?? others.find((s) => !s.isPrimary) ?? others[0]
    remember(SCREEN_KEY, chosen.label)
    return chosen
  } catch {
    // ปฏิเสธสิทธิ์ = ใช้แบบเดิมไป
    return null
  }
}

/**
 * `fullscreen=yes` ใช้ได้เฉพาะตอนได้สิทธิ์จัดการหน้าต่างแล้ว (Chrome 111+) — เบราว์เซอร์ที่ไม่รองรับ
 * จะเมินค่านี้เฉยๆ แล้วได้หน้าต่างเต็มจอที่สองแทน (จอลูกค้ามีปุ่มให้แตะขยายเองอีกชั้น)
 *
 * ทดสอบแล้วว่า **ป๊อปอัปสั่ง requestFullscreen() เองตอนเปิดไม่ได้** Chrome ถือว่าไม่มีการกดในหน้าต่างนั้น
 * ฉะนั้นเต็มจออัตโนมัติต้องมาจากตรงนี้ทางเดียว
 */
const fillScreen = (s: ScreenDetailed) =>
  `popup=yes,fullscreen=yes,left=${s.availLeft},top=${s.availTop},width=${s.availWidth},height=${s.availHeight}`

export type OpenDisplayResult =
  | 'focused'        // หน้าต่างเปิดค้างอยู่แล้ว แค่ดึงขึ้นมา
  | 'placed'         // เปิดตรงจอที่สองให้เรียบร้อย
  | 'one-screen'     // เครื่องนี้ต่อจอเดียว
  | 'just-allowed'   // เพิ่งกดอนุญาต — กดปุ่มอีกครั้งจะไปจอที่สอง
  | 'denied'         // Chrome ปิดสิทธิ์จัดการหน้าต่างไว้
  | 'unsupported'    // เบราว์เซอร์ไม่มี Window Management API
  | 'blocked'        // ป๊อปอัปโดนบล็อก

const openFallback = () => {
  displayWindow = window.open('/pos-display', WINDOW_NAME, 'popup=yes,width=1000,height=750')
  return displayWindow
}

/** สถานะสิทธิ์ "จัดการหน้าต่างบนจอทั้งหมด" โดยไม่เด้งกล่องถาม */
async function windowPermission(): Promise<PermissionState | null> {
  try {
    // ชื่อสิทธิ์ยังไม่อยู่ใน TS lib — Chrome 111+ ใช้ 'window-management'
    const status = await navigator.permissions.query({ name: 'window-management' as PermissionName })
    return status.state
  } catch {
    return null
  }
}

/**
 * ต้องเรียกจากการกดปุ่มเท่านั้น (เบราว์เซอร์บล็อกป๊อปอัปที่ไม่ได้มาจากการกด)
 *
 * **ลำดับสำคัญมาก**: `window.open()` กิน user activation ของการกดไป ขอสิทธิ์ทีหลังจึงเด้งกล่องถาม
 * ไม่ได้เลย (เคยพลาดมาแล้ว — กล่องไม่เคยขึ้น เลยหาจอที่สองไม่เจอทุกครั้ง) ต้องเช็ค/ขอสิทธิ์ก่อน
 * แล้วค่อยเปิดหน้าต่าง ส่วน `permissions.query()` ไม่กิน activation จึง await ได้อย่างปลอดภัย
 */
export async function openCustomerDisplay(): Promise<OpenDisplayResult> {
  if (displayWindow && !displayWindow.closed) {
    displayWindow.focus()
    return 'focused'
  }

  if (typeof (window as WindowWithScreens).getScreenDetails !== 'function') {
    return openFallback() ? 'unsupported' : 'blocked'
  }
  // เช็คได้โดยไม่ต้องมีสิทธิ์ — ต่อจอเดียวก็ไม่ต้องไปกวนให้กดอนุญาตเปล่าๆ
  if ((screen as ScreenMaybeExtended).isExtended === false) {
    return openFallback() ? 'one-screen' : 'blocked'
  }

  const permission = await windowPermission()
  if (permission === 'denied') {
    return openFallback() ? 'denied' : 'blocked'
  }

  if (permission === 'prompt' || permission === null) {
    // กล่องขออนุญาตใช้เวลานานกว่าที่ "การกด" จะหมดอายุ (5 วินาที) ป๊อปอัปรอบนี้จึงมักโดนบล็อก
    // ตั้งใจให้ครั้งแรกเป็นการตั้งค่าอย่างเดียว แล้วบอกให้กดอีกที — ครั้งต่อไปจบในกดเดียวตลอด
    const screenNow = await pickScreen()
    if (!screenNow) return openFallback() ? 'denied' : 'blocked'
    displayWindow = window.open(`/pos-display?fs=1`, WINDOW_NAME, fillScreen(screenNow))
    return displayWindow ? 'placed' : 'just-allowed'
  }

  const target = await pickScreen()
  if (!target) return openFallback() ? 'one-screen' : 'blocked'

  displayWindow = window.open(`/pos-display?fs=1`, WINDOW_NAME, fillScreen(target))
  return displayWindow ? 'placed' : 'blocked'
}
