/**
 * สร้างข้อมูลตัวอย่างทั้งร้านค้าและคลินิก — 1 มี.ค. 2026 ถึง 31 ม.ค. 2027
 *
 *   npx tsx scripts/mock-data.ts          สร้างข้อมูล
 *   npx tsx scripts/mock-data.ts --dry    ดูสรุปจำนวนโดยไม่เขียนลง DB
 *   npx tsx scripts/mock-data.ts --clean  ลบข้อมูลตัวอย่างทั้งหมดออก
 *
 * ทุกแถวที่สคริปต์นี้สร้างจะมี id ขึ้นต้นด้วย MOCK_PREFIX เสมอ จึงลบออกทีหลัง
 * ได้แม่นยำโดยไม่ต้องเพิ่มคอลัมน์หรือตารางใหม่ และไม่แตะของจริงเลย
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// โหลด .env.local เอง (สคริปต์นี้ไม่ได้รันผ่าน Next)
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

/** ทุก id ของข้อมูลตัวอย่างขึ้นต้นด้วยค่านี้ — ใช้เป็นเครื่องหมายตอนลบ */
const MOCK_PREFIX = 'dddddddd'
const mockId = () => `${MOCK_PREFIX}${randomUUID().slice(8)}`

/** ลำดับเอกสารของ mock เริ่มที่เลขนี้ เพื่อไม่ชนกับเลขที่บิลจริงที่ออกไปแล้ว */
const DOC_SEQ_BASE = 5000

const START = '2026-03-01'
const TODAY = '2026-09-18'
const END = '2027-01-31'

// ---------- helper ----------

const TZ_OFFSET = '+07:00'

/** สุ่มแบบกำหนด seed ได้ เพื่อให้รันซ้ำแล้วได้ข้อมูลหน้าตาเดิม */
let rngState = 20260918
function rnd(): number {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff
  return rngState / 0x7fffffff
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min
const chance = (p: number) => rnd() < p

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)

/** เวลาไทย → ISO instant */
const at = (date: string, hour: number, minute = 0) =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${TZ_OFFSET}`).toISOString()

const dmy = (date: string) => {
  const [y, m, d] = date.split('-')
  return `${d}${m}${y}`
}

const money = (n: number) => Math.round(n * 100) / 100

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

// ---------- ข้อมูลไทยสำหรับสุ่ม ----------

const FIRST_NAMES = [
  'สมชาย', 'สมหญิง', 'วิภา', 'ประภาส', 'ณัฐพล', 'ศิริพร', 'อนุชา', 'กมลวรรณ', 'ธนกร', 'พิมพ์ชนก',
  'ชัยวัฒน์', 'สุดารัตน์', 'ภาณุพงศ์', 'รัตนาภรณ์', 'ธีรศักดิ์', 'จันทิมา', 'วรวุฒิ', 'นภัสสร',
  'อรรถพล', 'ปิยะนุช', 'ทศพล', 'เบญจวรรณ', 'กิตติพงษ์', 'อารียา', 'ศุภชัย', 'ดวงใจ', 'พงศกร',
  'มณีรัตน์', 'วีระชัย', 'สุพรรษา', 'ฐิติพงศ์', 'ชลธิชา', 'ณรงค์ฤทธิ์', 'พรทิพย์', 'อิทธิพล',
]
const LAST_NAMES = [
  'ใจดี', 'ศรีสุข', 'ทองมา', 'แสงทอง', 'บุญมี', 'พูนทรัพย์', 'วงศ์สุวรรณ', 'รักเรียน', 'มั่นคง',
  'เจริญสุข', 'สายทอง', 'พิทักษ์', 'ชูเกียรติ', 'อ่อนหวาน', 'ธนาคาร', 'สุขสมบูรณ์', 'ไพศาล',
]
const DOG_NAMES = [
  'โมจิ', 'ข้าวปั้น', 'ตังเม', 'บราวนี่', 'ลูกเกด', 'ขนมปัง', 'โอริโอ้', 'ชาเย็น', 'มะลิ', 'ไข่มุก',
  'พุดดิ้ง', 'คุกกี้', 'ต้มยำ', 'ลาเต้', 'เฟรนช์ฟราย', 'ปอปเปอร์', 'หมูหยอง', 'ทองคำ', 'ขิง', 'แป้ง',
]
const CAT_NAMES = [
  'ส้มโอ', 'นมสด', 'ชีส', 'มะขาม', 'ขนมจีน', 'เค้ก', 'วุ้นเส้น', 'ฟักทอง', 'งาดำ', 'กะทิ',
  'แยม', 'ซูชิ', 'ถั่วแดง', 'มันม่วง', 'เผือก', 'ครีม', 'พริกไทย', 'เกลือ',
]
const COLORS = ['ขาว', 'ดำ', 'น้ำตาล', 'ครีม', 'ส้ม', 'เทา', 'ลายสลิด', 'ขาว-ดำ', 'ทอง', 'ลายเสือ']

const SYMPTOMS = [
  'ซึม ไม่กินอาหาร 2 วัน', 'ถ่ายเหลว มีมูกเลือด', 'คันตามตัว เกาไม่หยุด', 'อาเจียนหลังกินอาหาร',
  'ไอแห้ง ๆ ตอนกลางคืน', 'ขาหลังขวาเดินกะเผลก', 'ตาแดง มีขี้ตาเยอะ', 'หูมีกลิ่นเหม็น สะบัดหัวบ่อย',
  'มาฉีดวัคซีนตามนัด', 'ตรวจสุขภาพประจำปี', 'ผิวหนังเป็นสะเก็ด ขนร่วงเป็นหย่อม', 'ปัสสาวะบ่อย กระปริดกระปรอย',
]
const DIAGNOSES = [
  'ลำไส้อักเสบเฉียบพลัน', 'ภูมิแพ้ผิวหนัง', 'หูชั้นนอกอักเสบ', 'เยื่อบุตาอักเสบ', 'พยาธิในลำไส้',
  'โรคผิวหนังจากเชื้อรา', 'ข้อสะโพกเสื่อม', 'สุขภาพปกติ', 'กระเพาะปัสสาวะอักเสบ', 'หลอดลมอักเสบ',
]
const TREATMENTS = [
  'ให้ยาปฏิชีวนะ 7 วัน + ยาลดอักเสบ', 'ฉีดยาแก้แพ้ + แชมพูยา', 'ทำความสะอาดหู + หยอดยา 10 วัน',
  'หยอดตา วันละ 3 ครั้ง', 'ถ่ายพยาธิ นัดซ้ำใน 2 สัปดาห์', 'ให้น้ำเกลือใต้ผิวหนัง + ยาแก้อาเจียน',
  'ฉีดวัคซีนครบตามโปรแกรม', 'ให้ยาบำรุงข้อ + คุมน้ำหนัก',
]

// ---------- โครงเรื่องของข้อมูล ----------

interface Product {
  id: string
  name: string
  price: number
  cost: number | null
  unit: string
  is_service: boolean
  is_vaccine: boolean
  clinic_only: boolean
  online_available: boolean
  weight_grams: number | null
  vat_applicable: boolean | null
}

interface Ctx {
  products: Product[]
  retail: Product[]
  services: Product[]
  vaccines: Product[]
  online: Product[]
  breeds: { species: string; name: string }[]
  staffId: string
  vetId: string
  supplierIds: string[]
}

const counts: Record<string, number> = {}
const bump = (table: string, n: number) => { counts[table] = (counts[table] ?? 0) + n }

let DRY = false

/** แทรกเป็นก้อนละ 500 แถว — PostgREST รับ payload ใหญ่มากไม่ไหว */
async function insert(table: string, rows: Record<string, unknown>[]) {
  bump(table, rows.length)
  if (DRY || rows.length === 0) return
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 500))
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

// ---------- ลบข้อมูลตัวอย่าง ----------

/** เรียงจากลูกไปหาแม่ เพื่อไม่ให้ FK ขวาง */
const CLEAN_ORDER = [
  'appointment_reminder_log',
  'pet_vaccinations',
  'appointments',
  'visits',
  'transaction_items',
  'visit_items',
  'order_items',
  'orders',
  'transactions',
  'purchase_items',
  'purchases',
  'product_lots',
  'shifts',
  'pets',
  'customer_addresses',
  'customers',
  'suppliers',
]

// PostgREST เทียบ LIKE กับคอลัมน์ uuid ไม่ได้ (ไม่มี cast ให้อัตโนมัติ)
// จึงกรองด้วยช่วง uuid แทน — ครอบเฉพาะ id ที่ขึ้นต้นด้วย MOCK_PREFIX พอดี
const MOCK_UUID_LO = `${MOCK_PREFIX}-0000-0000-0000-000000000000`
const MOCK_UUID_HI = `${MOCK_PREFIX}-ffff-ffff-ffff-ffffffffffff`

async function clean() {
  console.log(`ลบแถวที่ id อยู่ในช่วง ${MOCK_UUID_LO} … ${MOCK_UUID_HI}\n`)
  let total = 0

  for (const table of CLEAN_ORDER) {
    // appointment_reminder_log ใช้ reminder_key (TEXT) เป็น PK — ใช้ LIKE ได้
    const isTextKey = table === 'appointment_reminder_log'
    const query = supabase.from(table).delete()
    const filtered = isTextKey
      ? query.like('reminder_key', `${MOCK_PREFIX}%`)
      : query.gte('id', MOCK_UUID_LO).lte('id', MOCK_UUID_HI)

    const { data, error } = await filtered.select(isTextKey ? 'reminder_key' : 'id')

    if (error) {
      console.log(`  ${table.padEnd(26)} ข้าม (${error.message})`)
      continue
    }
    const n = data?.length ?? 0
    total += n
    console.log(`  ${table.padEnd(26)} ลบ ${n} แถว`)
  }

  console.log(`\nลบไปทั้งหมด ${total} แถว — ข้อมูลจริงไม่ถูกแตะต้อง`)
}

// ---------- สร้างข้อมูล ----------

async function loadContext(): Promise<Ctx> {
  const [{ data: products }, { data: breeds }, { data: profiles }, { data: suppliers }] =
    await Promise.all([
      supabase.from('products').select('*').eq('active', true),
      supabase.from('breeds').select('species, name'),
      supabase.from('profiles').select('id, role'),
      supabase.from('suppliers').select('id'),
    ])

  const all = (products ?? []) as Product[]
  const admin = profiles?.find((p) => p.role === 'admin')?.id ?? profiles?.[0]?.id
  const cashier = profiles?.find((p) => p.role === 'cashier')?.id ?? admin

  if (!admin) throw new Error('ไม่พบ profiles — ต้องมีพนักงานอย่างน้อย 1 คน')

  return {
    products: all,
    retail: all.filter((p) => !p.is_service && !p.is_vaccine && !p.clinic_only),
    services: all.filter((p) => p.is_service),
    vaccines: all.filter((p) => p.is_vaccine),
    online: all.filter((p) => p.online_available),
    breeds: breeds ?? [],
    staffId: cashier!,
    vetId: admin,
    supplierIds: (suppliers ?? []).map((s) => s.id),
  }
}

function makeCustomers() {
  const customers: Record<string, unknown>[] = []
  const ids: string[] = []

  for (let i = 0; i < 45; i++) {
    const id = mockId()
    ids.push(id)
    // สมัครกระจายตลอดช่วง ลูกค้าเก่ามีก่อน ลูกค้าใหม่ทยอยเข้ามา
    const joined = addDays(START, int(0, daysBetween(START, TODAY)))
    customers.push({
      id,
      name: `คุณ${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: `0${pick(['6', '8', '9'])}${String(int(0, 99999999)).padStart(8, '0')}`,
      points: 0,
      total_spent: 0,
      credit_balance: chance(0.12) ? int(1, 8) * 50 : 0,
      created_at: at(joined, int(9, 19), int(0, 59)),
    })
  }
  return { customers, ids }
}

function makePets(ctx: Ctx, customerIds: string[]) {
  const pets: Record<string, unknown>[] = []
  const petsOf: Record<string, { id: string; species: string; name: string }[]> = {}

  const dogBreeds = ctx.breeds.filter((b) => b.species === 'dog')
  const catBreeds = ctx.breeds.filter((b) => b.species === 'cat')

  for (const customerId of customerIds) {
    // ส่วนใหญ่มีตัวเดียว บางบ้านมี 2-3 ตัว
    const n = chance(0.62) ? 1 : chance(0.75) ? 2 : 3
    petsOf[customerId] = []

    for (let i = 0; i < n; i++) {
      const isDog = chance(0.55)
      const breedList = isDog ? dogBreeds : catBreeds
      const id = mockId()
      const name = isDog ? pick(DOG_NAMES) : pick(CAT_NAMES)
      const birth = addDays(TODAY, -int(120, 3600))

      pets.push({
        id,
        customer_id: customerId,
        name,
        species: isDog ? 'dog' : 'cat',
        breed: breedList.length > 0 ? pick(breedList).name : null,
        sex: chance(0.5) ? 'male' : 'female',
        birth_date: birth,
        color: pick(COLORS),
        sterilized: chance(0.55),
        active: true,
        created_at: at(addDays(START, int(0, daysBetween(START, TODAY))), int(9, 19)),
      })
      petsOf[customerId].push({ id, species: isDog ? 'dog' : 'cat', name })
    }
  }
  return { pets, petsOf }
}

/** รับของเข้าร้าน + ล็อตสินค้า ให้มีของขายตลอดช่วง */
function makePurchases(ctx: Ctx) {
  const purchases: Record<string, unknown>[] = []
  const items: Record<string, unknown>[] = []
  const lots: Record<string, unknown>[] = []

  const stockable = ctx.products.filter((p) => !p.is_service)
  const days = daysBetween(START, TODAY)

  // รับของราว ๆ ทุก 10 วัน
  for (let d = 0; d <= days; d += 10) {
    const date = addDays(START, d)
    const purchaseId = mockId()
    const chosen: Product[] = []
    for (let i = 0; i < int(4, 9); i++) {
      const p = pick(stockable)
      if (!chosen.some((c) => c.id === p.id)) chosen.push(p)
    }

    let totalCost = 0
    for (const p of chosen) {
      const qty = p.is_vaccine ? int(10, 30) : int(12, 40)
      const unitCost = money(p.cost ?? p.price * 0.62)
      totalCost += unitCost * qty

      items.push({
        id: mockId(),
        purchase_id: purchaseId,
        product_id: p.id,
        quantity: qty,
        unit_cost: unitCost,
      })
      lots.push({
        id: mockId(),
        product_id: p.id,
        lot_number: `LOT${dmy(date)}`,
        // ยาและวัคซีนหมดอายุเร็วกว่าของใช้
        expiry_date: addDays(date, p.is_vaccine ? int(300, 540) : int(400, 900)),
        quantity: qty,
        initial_quantity: qty,
        created_at: at(date, 10, int(0, 50)),
      })
    }

    purchases.push({
      id: purchaseId,
      purchase_number: `PO${dmy(date)}${String(DOC_SEQ_BASE + Math.floor(d / 10)).padStart(4, '0')}`,
      supplier_id: ctx.supplierIds.length > 0 ? pick(ctx.supplierIds) : null,
      total_cost: money(totalCost),
      created_at: at(date, 10, int(0, 50)),
    })
  }

  return { purchases, items, lots }
}

/** ตะกร้าหนึ่งใบ — ของหน้าร้าน ผสมบริการคลินิกบ้าง */
function makeBasket(ctx: Ctx, clinicVisit: boolean) {
  const lines: { product: Product; qty: number }[] = []
  const n = clinicVisit ? int(1, 3) : int(1, 4)

  for (let i = 0; i < n; i++) {
    const pool = clinicVisit && chance(0.7) ? ctx.services : ctx.retail
    if (pool.length === 0) continue
    const product = pick(pool)
    if (lines.some((l) => l.product.id === product.id)) continue
    lines.push({ product, qty: product.is_service ? 1 : chance(0.78) ? 1 : int(2, 3) })
  }

  if (lines.length === 0) lines.push({ product: pick(ctx.retail), qty: 1 })
  return lines
}

function makeSales(ctx: Ctx, customerIds: string[]) {
  const transactions: Record<string, unknown>[] = []
  const items: Record<string, unknown>[] = []
  const shifts: Record<string, unknown>[] = []
  const spendByCustomer: Record<string, number> = {}

  const days = daysBetween(START, TODAY)

  for (let d = 0; d <= days; d++) {
    const date = addDays(START, d)
    const dow = weekday(date)
    // เสาร์อาทิตย์คนเยอะกว่า
    const busy = dow === 0 || dow === 6
    const billCount = busy ? int(9, 16) : int(4, 11)

    let daySeq = 0
    let cashTotal = 0

    for (let b = 0; b < billCount; b++) {
      daySeq += 1
      const hour = int(9, 19)
      const minute = int(0, 59)
      const clinicVisit = chance(0.28)
      const lines = makeBasket(ctx, clinicVisit)
      const txId = mockId()

      let subtotal = 0
      const itemRows: Record<string, unknown>[] = []
      for (const line of lines) {
        const lineSubtotal = money(line.product.price * line.qty)
        subtotal += lineSubtotal
        itemRows.push({
          id: mockId(),
          transaction_id: txId,
          product_id: line.product.id,
          quantity: line.qty,
          unit_price: line.product.price,
          discount: 0,
          subtotal: lineSubtotal,
          vat_applicable: line.product.vat_applicable ?? false,
          created_at: at(date, hour, minute),
        })
      }

      // ส่วนลดเป็นครั้งคราว
      const discount = chance(0.14) ? money(Math.min(subtotal * 0.05, 100)) : 0
      const total = money(subtotal - discount)

      // ลูกค้าประจำผูกบัญชี ส่วนที่เหลือเป็นลูกค้าจร
      const customerId = chance(0.62) ? pick(customerIds) : null
      if (customerId) spendByCustomer[customerId] = (spendByCustomer[customerId] ?? 0) + total

      const method = (() => {
        const r = rnd()
        if (r < 0.46) return 'cash'
        if (r < 0.82) return 'qr'
        if (r < 0.94) return 'transfer'
        return 'card'
      })()

      // ยกเลิกบิลนาน ๆ ครั้ง
      const cancelled = chance(0.018)
      if (method === 'cash' && !cancelled) cashTotal += total

      transactions.push({
        id: txId,
        transaction_number: `RC${dmy(date)}${String(DOC_SEQ_BASE + daySeq).padStart(4, '0')}`,
        cashier_id: clinicVisit ? ctx.vetId : ctx.staffId,
        customer_id: customerId,
        subtotal: money(subtotal),
        discount,
        total,
        payment_method: method,
        cash_received: method === 'cash' ? Math.ceil(total / 20) * 20 : 0,
        change_given: method === 'cash' ? money(Math.ceil(total / 20) * 20 - total) : 0,
        points_earned: customerId ? Math.floor(total / 100) : 0,
        points_used: 0,
        credit_used: 0,
        status: cancelled ? 'cancelled' : 'completed',
        cancelled_at: cancelled ? at(date, Math.min(hour + 1, 20), minute) : null,
        cancelled_by: cancelled ? ctx.staffId : null,
        cancel_reason: cancelled ? pick(['ลูกค้าเปลี่ยนใจ', 'กดผิดรายการ', 'สินค้าไม่พอ']) : null,
        restocked: cancelled ? true : null,
        created_at: at(date, hour, minute),
      })
      items.push(...itemRows)
    }

    // ปิดกะทุกวัน — เงินขาด/เกินเล็กน้อยบ้างตามจริง
    const opening = 2000
    const expected = money(opening + cashTotal)
    const diff = chance(0.72) ? 0 : money((chance(0.5) ? 1 : -1) * int(1, 5) * 20)
    const counted = money(expected + diff)
    const toOwner = Math.floor(Math.max(counted - 2000, 0) / 1000) * 1000

    shifts.push({
      id: mockId(),
      opened_at: at(date, 8, 45),
      opened_by: ctx.staffId,
      opening_cash: opening,
      closed_at: at(date, 20, int(5, 40)),
      closed_by: ctx.staffId,
      expected_cash: expected,
      closing_cash_counted: counted,
      cash_difference: diff,
      cash_to_owner: toOwner,
      notes: diff !== 0 && chance(0.5) ? 'นับซ้ำแล้ว ยอดตามนี้' : null,
      created_at: at(date, 8, 45),
    })
  }

  return { transactions, items, shifts, spendByCustomer }
}

function makeClinic(ctx: Ctx, petsOf: Record<string, { id: string; species: string; name: string }[]>) {
  const visits: Record<string, unknown>[] = []
  const visitItems: Record<string, unknown>[] = []
  const vaccinations: Record<string, unknown>[] = []
  const appointments: Record<string, unknown>[] = []

  const allPets = Object.entries(petsOf).flatMap(([customerId, pets]) =>
    pets.map((p) => ({ ...p, customerId }))
  )

  const pastDays = daysBetween(START, TODAY)
  const visitSeq: Record<string, number> = {}

  // --- เวชระเบียนย้อนหลัง ---
  for (let d = 0; d <= pastDays; d++) {
    const date = addDays(START, d)
    const dow = weekday(date)
    if (dow === 1 && chance(0.6)) continue // จันทร์คนน้อย

    for (let v = 0; v < int(1, 4); v++) {
      const pet = pick(allPets)
      const hour = int(9, 18)
      const visitId = mockId()
      visitSeq[date] = (visitSeq[date] ?? 0) + 1

      const isVaccineVisit = chance(0.3)
      const followUp = chance(0.22) ? addDays(date, int(7, 30)) : null

      visits.push({
        id: visitId,
        visit_number: `OPD${dmy(date)}${String(DOC_SEQ_BASE + visitSeq[date]).padStart(4, '0')}`,
        pet_id: pet.id,
        customer_id: pet.customerId,
        vet_id: ctx.vetId,
        visit_date: at(date, hour, int(0, 59)),
        weight: money(pet.species === 'dog' ? int(25, 320) / 10 : int(25, 75) / 10),
        temperature: money(int(378, 393) / 10),
        heart_rate: int(70, 160),
        resp_rate: int(15, 40),
        symptoms: isVaccineVisit ? 'มาฉีดวัคซีนตามนัด' : pick(SYMPTOMS),
        diagnosis: isVaccineVisit ? 'สุขภาพปกติ' : pick(DIAGNOSES),
        treatment: isVaccineVisit ? 'ฉีดวัคซีนครบตามโปรแกรม' : pick(TREATMENTS),
        follow_up_date: followUp,
        // เคสเก่าเก็บเงินจบแล้ว เคสของวันนี้ยังค้างอยู่ในคิวบ้าง
        status: d >= pastDays - 1
          ? pick(['waiting', 'open', 'pending_payment', 'paid'] as const)
          : chance(0.97) ? 'paid' : 'cancelled',
        created_by: ctx.vetId,
        created_at: at(date, hour, int(0, 59)),
      })

      // ยา/บริการที่หมอสั่งจ่ายในเคสนี้
      const prescribed: string[] = []
      for (let k = 0; k < int(1, 4); k++) {
        const pool = chance(0.55) ? ctx.services : ctx.products.filter((x) => !x.is_service && !x.is_vaccine)
        if (pool.length === 0) continue
        const product = pick(pool)
        if (prescribed.includes(product.id)) continue
        prescribed.push(product.id)
        visitItems.push({
          id: mockId(),
          visit_id: visitId,
          product_id: product.id,
          quantity: product.is_service ? 1 : int(1, 10),
          unit_price: product.price,
          dosage: product.is_service ? null : pick([
            'วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น',
            'วันละ 1 ครั้ง ก่อนนอน',
            'ทาบริเวณที่เป็น วันละ 2 ครั้ง',
            'กินครั้งละ 1 เม็ด ทุก 12 ชม.',
          ]),
          created_at: at(date, hour, int(0, 59)),
        })
      }

      if (isVaccineVisit && ctx.vaccines.length > 0) {
        const vaccine = pick(ctx.vaccines.filter((x) =>
          pet.species === 'dog' ? !/แมว|FVRCP/.test(x.name) : !/สุนัข|DHPPL/.test(x.name)
        ) ?? ctx.vaccines)
        const chosen = vaccine ?? pick(ctx.vaccines)
        vaccinations.push({
          id: mockId(),
          pet_id: pet.id,
          vaccine_name: chosen.name,
          product_id: chosen.id,
          dose_date: date,
          next_due_date: addDays(date, 365),
          lot_number: `LOT${dmy(date)}`,
          vet_id: ctx.vetId,
          visit_id: visitId,
          created_by: ctx.vetId,
          created_at: at(date, hour, int(0, 59)),
        })
      }

      // นัดที่ผ่านมาแล้ว — มาบ้าง ไม่มาบ้าง
      if (followUp && followUp <= TODAY) {
        appointments.push({
          id: mockId(),
          pet_id: pet.id,
          customer_id: pet.customerId,
          vet_id: ctx.vetId,
          scheduled_at: at(followUp, int(9, 17), pick([0, 30])),
          type: 'follow_up',
          status: chance(0.82) ? 'done' : 'missed',
          notes: `ติดตามอาการ: ${pick(DIAGNOSES)}`,
          visit_id: visitId,
          created_by: ctx.vetId,
          created_at: at(date, hour, int(0, 59)),
        })
      }
    }
  }

  // --- นัดล่วงหน้า ถึงสิ้นเดือน ม.ค. 2027 ---
  const futureDays = daysBetween(TODAY, END)
  for (let d = 1; d <= futureDays; d++) {
    const date = addDays(TODAY, d)
    const dow = weekday(date)
    if (dow === 1) continue

    // ใกล้ ๆ นี้นัดแน่น ไกลออกไปเบาบางลงตามจริง
    const density = d <= 14 ? int(2, 5) : d <= 45 ? int(1, 3) : chance(0.55) ? int(1, 2) : 0

    for (let a = 0; a < density; a++) {
      const pet = pick(allPets)
      const type = pick(['checkup', 'vaccine', 'follow_up', 'surgery', 'other'] as const)
      appointments.push({
        id: mockId(),
        pet_id: pet.id,
        customer_id: pet.customerId,
        vet_id: chance(0.8) ? ctx.vetId : null,
        scheduled_at: at(date, int(9, 17), pick([0, 30])),
        type,
        status: 'scheduled',
        notes: type === 'surgery'
          ? 'งดน้ำงดอาหารก่อนมา 8 ชม.'
          : type === 'vaccine'
            ? 'วัคซีนประจำปี'
            : chance(0.4) ? pick(SYMPTOMS) : null,
        created_by: ctx.vetId,
        created_at: at(addDays(date, -int(3, 30)), int(9, 18), int(0, 59)),
      })
    }
  }

  return { visits, visitItems, vaccinations, appointments }
}

function makeOnlineOrders(ctx: Ctx, customerIds: string[]) {
  const orders: Record<string, unknown>[] = []
  const items: Record<string, unknown>[] = []

  if (ctx.online.length === 0) return { orders, items }

  const days = daysBetween(START, TODAY)
  const seqByDate: Record<string, number> = {}

  for (let i = 0; i < 48; i++) {
    const date = addDays(START, int(0, days))
    seqByDate[date] = (seqByDate[date] ?? 0) + 1
    const orderId = mockId()
    const hour = int(9, 22)
    const customerId = pick(customerIds)
    const pickup = chance(0.3)

    const lines: { product: Product; qty: number }[] = []
    for (let n = 0; n < int(1, 3); n++) {
      const product = pick(ctx.online)
      if (lines.some((l) => l.product.id === product.id)) continue
      lines.push({ product, qty: chance(0.8) ? 1 : 2 })
    }
    if (lines.length === 0) continue

    let subtotal = 0
    let weight = 0
    for (const line of lines) {
      const lineSubtotal = money(line.product.price * line.qty)
      subtotal += lineSubtotal
      weight += (line.product.weight_grams ?? 500) * line.qty
      items.push({
        id: mockId(),
        order_id: orderId,
        product_id: line.product.id,
        product_name: line.product.name,
        unit: line.product.unit,
        unit_price: line.product.price,
        quantity: line.qty,
        subtotal: lineSubtotal,
        weight_grams: line.product.weight_grams ?? 500,
        created_at: at(date, hour, int(0, 59)),
      })
    }

    const shipping = pickup ? 0 : subtotal >= 1500 ? 0 : 50
    // สถานะกระจายตามอายุออเดอร์ ของเก่าจบแล้ว ของใหม่ยังค้างอยู่
    const age = daysBetween(date, TODAY)
    const status = age > 7
      ? (chance(0.92) ? 'completed' : 'cancelled')
      : pick(['pending_payment', 'awaiting_confirm', 'confirmed', 'shipped', 'completed'] as const)

    const done = status === 'completed'
    const confirmed = ['confirmed', 'shipped', 'completed'].includes(status)

    orders.push({
      id: orderId,
      order_number: `ON${dmy(date)}${String(DOC_SEQ_BASE + seqByDate[date]).padStart(4, '0')}`,
      customer_id: customerId,
      status,
      fulfillment: pickup ? 'pickup' : 'delivery',
      subtotal: money(subtotal),
      shipping_fee: shipping,
      discount: 0,
      total: money(subtotal + shipping),
      total_weight_grams: weight,
      recipient_name: pickup ? null : `คุณ${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: pickup ? null : `0${pick(['6', '8', '9'])}${String(int(0, 99999999)).padStart(8, '0')}`,
      address_line: pickup ? null : `${int(1, 299)}/${int(1, 99)} ซอย${pick(['ลาดพร้าว', 'วิภาวดี', 'รามคำแหง', 'พหลโยธิน'])} ${int(1, 60)}`,
      subdistrict: pickup ? null : pick(['สนามบิน', 'จตุจักร', 'ลาดยาว', 'คลองถนน']),
      district: pickup ? null : pick(['ดอนเมือง', 'จตุจักร', 'บางเขน', 'หลักสี่']),
      province: pickup ? null : 'กรุงเทพมหานคร',
      postal_code: pickup ? null : pick(['10210', '10220', '10900', '10230']),
      shipping_zone_name: pickup ? null : 'กรุงเทพฯ และปริมณฑล',
      customer_note: chance(0.2) ? pick(['ฝากไว้หน้าบ้านได้เลยค่ะ', 'โทรก่อนส่ง', 'ส่งหลัง 17.00 น.']) : null,
      paid_reported_at: status === 'pending_payment' ? null : at(date, Math.min(hour + 1, 23), int(0, 59)),
      confirmed_at: confirmed ? at(addDays(date, 1), int(9, 12), int(0, 59)) : null,
      confirmed_by: confirmed ? ctx.staffId : null,
      shipped_at: ['shipped', 'completed'].includes(status) ? at(addDays(date, 1), int(13, 17), int(0, 59)) : null,
      tracking_carrier: ['shipped', 'completed'].includes(status) ? pick(['Kerry', 'Flash', 'J&T', 'ไปรษณีย์ไทย']) : null,
      tracking_number: ['shipped', 'completed'].includes(status) ? `TH${int(100000000, 999999999)}` : null,
      completed_at: done ? at(addDays(date, int(2, 4)), int(10, 18), int(0, 59)) : null,
      cancelled_at: status === 'cancelled' ? at(addDays(date, 1), int(9, 18), int(0, 59)) : null,
      cancelled_by: status === 'cancelled' ? ctx.staffId : null,
      cancel_reason: status === 'cancelled' ? pick(['ลูกค้าไม่ชำระเงินตามกำหนด', 'ลูกค้าขอยกเลิก']) : null,
      created_at: at(date, hour, int(0, 59)),
    })
  }

  return { orders, items }
}

// ---------- main ----------

async function seed() {
  console.log(`สร้างข้อมูลตัวอย่าง ${START} → ${END}${DRY ? '  (dry run — ไม่เขียนลง DB)' : ''}\n`)

  const ctx = await loadContext()
  console.log(`อ้างอิงสินค้า ${ctx.products.length} รายการ · สายพันธุ์ ${ctx.breeds.length} · พนักงาน 2 คน\n`)

  const { customers, ids: customerIds } = makeCustomers()
  const { pets, petsOf } = makePets(ctx, customerIds)
  const { purchases, items: purchaseItems, lots } = makePurchases(ctx)
  const { transactions, items: txItems, shifts, spendByCustomer } = makeSales(ctx, customerIds)
  const { visits, visitItems, vaccinations, appointments } = makeClinic(ctx, petsOf)
  const { orders, items: orderItems } = makeOnlineOrders(ctx, customerIds)

  // ยอดสะสม/แต้มของลูกค้า mock ให้ตรงกับบิลที่สร้างไว้
  for (const c of customers) {
    const spent = spendByCustomer[c.id as string] ?? 0
    c.total_spent = money(spent)
    c.points = Math.floor(spent / 100)
  }

  // ลำดับสำคัญ: แม่ก่อนลูก ไม่งั้น FK ล้ม
  await insert('customers', customers)
  await insert('pets', pets)
  await insert('purchases', purchases)
  await insert('purchase_items', purchaseItems)
  await insert('product_lots', lots)
  await insert('shifts', shifts)
  await insert('transactions', transactions)
  await insert('transaction_items', txItems)
  await insert('visits', visits)
  await insert('visit_items', visitItems)
  await insert('pet_vaccinations', vaccinations)
  await insert('appointments', appointments)
  await insert('orders', orders)
  await insert('order_items', orderItems)

  console.log('สรุปจำนวนแถว')
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(22)} ${String(n).padStart(6)}`)
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  console.log(`  ${'รวม'.padEnd(22)} ${String(total).padStart(6)}`)

  const future = appointments.filter((a) => a.status === 'scheduled').length
  console.log(`\nนัดล่วงหน้า (${TODAY} → ${END}): ${future} นัด`)
  console.log(DRY ? '\ndry run — ยังไม่ได้เขียนอะไรลง DB' : '\nเสร็จแล้ว')
}

const arg = process.argv[2]
DRY = arg === '--dry'

if (arg === '--clean') {
  clean().catch((err) => { console.error(err); process.exit(1) })
} else {
  seed().catch((err) => { console.error(err); process.exit(1) })
}
