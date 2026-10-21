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

    const others = details.screens.filter((s) => s.label !== details.currentScreen.label)
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

export type OpenDisplayResult = 'focused' | 'placed' | 'moved' | 'fallback' | 'blocked'

/**
 * ต้องเรียกจากการกดปุ่มเท่านั้น (เบราว์เซอร์บล็อกป๊อปอัปที่ไม่ได้มาจากการกด)
 *
 * ครั้งแรกที่ยังไม่มีสิทธิ์: เปิดหน้าต่างก่อนทันทีตอนที่ยังมี "การกด" อยู่ในมือ แล้วค่อยขออนุญาต
 * และย้ายไปจอที่สอง — ถ้าขอสิทธิ์ก่อนจะเสียจังหวะการกดไป แล้วป๊อปอัปโดนบล็อก
 */
export async function openCustomerDisplay(): Promise<OpenDisplayResult> {
  if (displayWindow && !displayWindow.closed) {
    displayWindow.focus()
    return 'focused'
  }

  // เคยให้สิทธิ์แล้ว = ถามพิกัดจอได้เร็วพอที่จะยังเปิดป๊อปอัปได้ เปิดตรงจอที่สองไปเลยทีเดียว
  const known = recall(READY_KEY) === '1' ? await pickScreen() : null
  if (known) {
    displayWindow = window.open(`/pos-display?fs=1`, WINDOW_NAME, fillScreen(known))
    return displayWindow ? 'placed' : 'blocked'
  }

  displayWindow = window.open('/pos-display', WINDOW_NAME, 'popup=yes,width=1000,height=750')
  if (!displayWindow) return 'blocked'

  const screen = await pickScreen()
  if (!screen) return 'fallback'

  // ย้ายทีหลังจึงสั่งเต็มจอข้ามหน้าต่างไม่ได้ — หน้าจอลูกค้าจะขึ้นปุ่มให้แตะเอง (ครั้งแรกครั้งเดียว)
  displayWindow.moveTo(screen.availLeft, screen.availTop)
  displayWindow.resizeTo(screen.availWidth, screen.availHeight)
  return 'moved'
}
