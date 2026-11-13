/**
 * ลำดับการเรียงของตารางลูกค้า — อ่านจาก ?sort= &dir= ใน URL แล้วเรียงที่ server
 *
 * ต้องเรียงที่ server เพราะหน้านี้ส่งมาแค่ 100 แถวแรก ถ้าเรียงในเบราว์เซอร์
 * จะได้แค่ "เรียง 100 แถวที่หยิบมา" ไม่ใช่เรียงลูกค้าทั้งร้าน
 *
 * คุมคอลัมน์เป็น whitelist เพราะค่ามาจาก URL ตรง ๆ (กันยัดชื่อคอลัมน์อื่นเข้ามา)
 */
const LOW_HIGH = { asc: 'น้อย→มาก', desc: 'มาก→น้อย' } as const
const OLD_NEW = { asc: 'เก่า→ใหม่', desc: 'ใหม่→เก่า' } as const

export const SORT_COLUMNS = {
  // HN = "YY####" (ปี พ.ศ. 2 หลัก + ลำดับ) เรียงแบบ text ได้เลย เพราะเติม 0 นำหน้าครบ
  hn: { label: 'HN', defaultDir: 'desc', dirs: OLD_NEW },
  full_name: { label: 'ชื่อ', defaultDir: 'asc', dirs: { asc: 'ก→ฮ', desc: 'ฮ→ก' } },
  phone: { label: 'เบอร์โทร', defaultDir: 'asc', dirs: { asc: '0→9', desc: '9→0' } },
  points: { label: 'แต้มสะสม', defaultDir: 'desc', dirs: LOW_HIGH },
  credit_balance: { label: 'เครดิต', defaultDir: 'desc', dirs: LOW_HIGH },
  total_spent: { label: 'ยอดซื้อสะสม', defaultDir: 'desc', dirs: LOW_HIGH },
  created_at: { label: 'สมัครเมื่อ', defaultDir: 'desc', dirs: OLD_NEW },
} as const

export type SortKey = keyof typeof SORT_COLUMNS
export type SortDir = 'asc' | 'desc'

/** ค่าเริ่มต้นเดิมของหน้านี้ — HN ใหม่สุดอยู่บน */
export const DEFAULT_SORT: SortKey = 'hn'

export function resolveSort(sort?: string, dir?: string): { key: SortKey; dir: SortDir } {
  const key = (sort && sort in SORT_COLUMNS ? sort : DEFAULT_SORT) as SortKey
  const direction: SortDir = dir === 'asc' || dir === 'desc' ? dir : SORT_COLUMNS[key].defaultDir
  return { key, dir: direction }
}
