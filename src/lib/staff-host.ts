// เว็บเดียวเสิร์ฟสองกลุ่ม แยกกันที่โดเมน ไม่ใช่ที่ path
//
//   pos.landbark.app              → คนในร้าน
//   landbark.app, www.landbark.app → ลูกค้า
//
// เพิ่มโดเมนได้ด้วย STAFF_HOSTS / CUSTOMER_HOSTS (คั่นด้วย ,) เผื่อมีโดเมนทดสอบ
// โดเมนที่ไม่อยู่ในสองรายการนี้ (เช่น localhost ตอน dev) ถือว่าเป็นกลาง ไม่ถูกเด้งไปไหน
const DEFAULT_STAFF_HOSTS = ['pos.landbark.app']
const DEFAULT_CUSTOMER_HOSTS = ['landbark.app', 'www.landbark.app']

function hostList(raw: string | undefined, fallback: string[]): string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : fallback
}

/** host มาจาก header จึงอาจมีพอร์ตติดมา และตัวพิมพ์ไม่แน่นอน */
function hostname(host?: string | null): string | null {
  return host ? host.toLowerCase().split(':')[0] : null
}

export function isStaffHost(host?: string | null): boolean {
  const name = hostname(host)
  return name !== null && hostList(process.env.STAFF_HOSTS, DEFAULT_STAFF_HOSTS).includes(name)
}

export function isCustomerHost(host?: string | null): boolean {
  const name = hostname(host)
  return name !== null && hostList(process.env.CUSTOMER_HOSTS, DEFAULT_CUSTOMER_HOSTS).includes(name)
}

/** โดเมนพนักงานตัวหลัก — ปลายทางเวลาต้องส่งคนข้ามมาจากโดเมนลูกค้า */
export function primaryStaffHost(): string {
  return hostList(process.env.STAFF_HOSTS, DEFAULT_STAFF_HOSTS)[0]
}

/** โดเมนลูกค้าตัวหลัก — ปลายทางของลิงก์ "กลับหน้าเว็บร้าน" ใน /storefront */
export function primaryCustomerHost(): string {
  return hostList(process.env.CUSTOMER_HOSTS, DEFAULT_CUSTOMER_HOSTS)[0]
}

// หน้าที่เป็นงานหลังร้าน ไม่ใช่ของลูกค้า
// ไม่รวม /print/receipt — ลูกค้าเปิดใบเสร็จของตัวเองได้ และ proxy ปล่อยผ่านอยู่แล้ว
const STAFF_PATHS = ['/pos', '/admin', '/login', '/no-access', '/pos-display', '/auth']

export function isStaffPath(pathname: string): boolean {
  return STAFF_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}
