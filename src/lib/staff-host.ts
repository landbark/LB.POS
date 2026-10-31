// โดเมนของพนักงาน — เปิดมาต้องเจอหน้างาน ไม่ใช่หน้าร้านที่ลูกค้าเห็น
//
// เว็บเดียวกันเสิร์ฟสองกลุ่ม: ลูกค้า (/, /shop, /news) กับคนในร้าน (/pos, /admin)
// แยกกันที่โดเมน ไม่ใช่ที่โค้ด — pos.landbark.app คือของพนักงาน
// ส่วน landbark.app กับโดเมน Vercel เดิมยังเป็นหน้าร้านของลูกค้าตามเดิม
//
// เพิ่มโดเมนได้ด้วย STAFF_HOSTS (คั่นด้วย ,) เผื่อวันที่มีโดเมนทดสอบอีกตัว
const DEFAULT_STAFF_HOSTS = ['pos.landbark.app']

function staffHosts(): string[] {
  const fromEnv = (process.env.STAFF_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return fromEnv.length > 0 ? fromEnv : DEFAULT_STAFF_HOSTS
}

/** host มาจาก header จึงอาจมีพอร์ตติดมา และตัวพิมพ์ไม่แน่นอน */
export function isStaffHost(host?: string | null): boolean {
  if (!host) return false
  const name = host.toLowerCase().split(':')[0]
  return staffHosts().includes(name)
}
