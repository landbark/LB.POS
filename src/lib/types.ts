/** ข้อความติดต่อท้ายข้อความเตือนนัดที่ส่งให้เจ้าของสัตว์ — ร้านแก้เองได้ในหน้าแจ้งเตือน */
export const DEFAULT_REMINDER_FOOTER =
  'ถ้าต้องการเลื่อนนัดหรือสอบถามเพิ่มเติม ติดต่อคลินิกได้เลยค่ะ\nLINE: @landbark · โทร. 098-329-5945'

export type Role = 'admin' | 'cashier' | 'vet' | 'vet_plus'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'เจ้าของร้าน',
  cashier: 'พนักงานขาย',
  vet: 'สัตวแพทย์',
  vet_plus: 'สัตวแพทย์พิเศษ',
}

export interface Profile {
  id: string
  role: Role
  name: string
  email: string | null
  active: boolean
  created_at: string
}

// Whitelist อีเมลพนักงานที่อนุญาตให้เข้าระบบ
export interface StaffEmail {
  id: string
  email: string
  name: string
  role: Role
  created_at: string
  // สถานะจาก auth (join ตอนแสดงผลในหน้าตั้งค่า)
  user_id?: string | null
  has_password?: boolean
}

export interface Category {
  id: string
  name: string
  /** หมวดนี้เป็นสินค้าที่ต้องเสีย VAT ไหม — ใช้เป็นค่าตั้งต้นให้สินค้าในหมวด */
  vat_applicable: boolean
  /** ของคลินิก (ยา/เวชภัณฑ์) — ไม่ขึ้นในหน้าขาย จ่ายได้จากหน้าตรวจรักษาเท่านั้น */
  clinic_only: boolean
  /** เป็นวัคซีน — จ่ายในหน้าตรวจแล้วลงประวัติวัคซีนอัตโนมัติ */
  is_vaccine: boolean
  created_at: string
}

export interface Unit {
  id: string
  name: string
  created_at: string
}

/**
 * หน่วยขายใหญ่ของสินค้า (กล่อง/ลัง/กระสอบ) — สต็อคยังนับเป็นหน่วยฐานกองเดียว
 * หน่วยฐาน (products.unit) ไม่มีแถวในตารางนี้ เพราะมันคือ factor 1 อยู่แล้ว
 */
export interface ProductUnit {
  id: string
  product_id: string
  unit_name: string
  /** จำนวนหน่วยฐานต่อ 1 หน่วยนี้ (กล่องละ 12 ซอง = 12) */
  factor: number
  sku: string | null
  barcode: string | null
  /** ราคายกแพ็ก (null = factor × ราคาฐาน คือไม่ลด) */
  price: number | null
  /** ทุนต่อแพ็ก (null = factor × ทุนฐาน) */
  cost: number | null
  sellable_pos: boolean
  sellable_online: boolean
  purchasable: boolean
  sort_order: number
  active: boolean
  created_at: string
}

export interface Product {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  category_id: string | null
  supplier_id: string | null
  price: number
  /** ราคาขายตอนออกบูธ — null = ใช้ราคาปกติ (ชุดเดียวใช้ได้ทุกงาน) */
  booth_price: number | null
  cost: number | null
  unit: string
  min_stock: number
  /** null = ใช้ตามหมวดหมู่, true/false = ตั้งแยกเฉพาะสินค้าตัวนี้ */
  vat_applicable: boolean | null
  /** null = ใช้ตามหมวดหมู่ */
  clinic_only: boolean | null
  /** เป็นวัคซีน (null = ตามหมวด) */
  is_vaccine: boolean | null
  /** ประเภทนัดกระตุ้น: 4w=4 สัปดาห์, annual=วันเดิมปีถัดไป, custom=ใช้ booster_interval_days */
  booster_type: BoosterType | null
  /** จำนวนวัน (เฉพาะ booster_type = custom) */
  booster_interval_days: number | null
  /** ค่าตรวจ/ค่าหัตถการ — ขายได้ตามปกติ แต่ไม่มีสต็อคให้ตัด */
  is_service: boolean
  /** ชื่อที่พิมพ์บนฉลากยา (ไม่ใส่ = ใช้ชื่อสินค้า) */
  label_name: string | null
  /** ชื่อบนฉลากภาษาอังกฤษ (ไม่ใส่ = ใช้ชื่อไทย) */
  label_name_en: string | null
  /** สรรพคุณกำกับบนฉลากยา */
  indication: string | null
  /** สรรพคุณภาษาอังกฤษ (ไม่ใส่ = ใช้ข้อความไทย) */
  indication_en: string | null
  /** ยี่ห้อ — ขึ้นใต้ชื่อยาบนฉลาก */
  brand: string | null
  /** คำค้นสำรองที่ร้านเติมเอง — คั่นด้วยช่องว่าง/จุลภาค ใช้หาสินค้าที่ชื่อไม่ตรงกับที่คนเรียก */
  search_keywords: string | null
  /** น้ำหนักต่อหน่วย (กรัม) — ใช้คิดค่าส่งบนเว็บ */
  weight_grams: number | null
  /** ขึ้นขายบนหน้าเว็บร้านค้าออนไลน์ */
  online_available: boolean
  /** ลงขายไว้บนร้าน Shopee แล้ว — ร้านติ๊กเอง ใช้คัดรายการตอนออกไฟล์ไปอัปเดตฝั่ง Shopee */
  on_shopee: boolean
  /** คำอธิบายสินค้าสำหรับหน้าเว็บ (ไม่ใส่ = โชว์แค่ชื่อ) */
  online_description: string | null
  image_url: string | null
  active: boolean
  /** ตัวนี้ถูกยุบไปเป็นหน่วยของสินค้าอื่นแล้ว (สินค้าแพ็กรุ่นเก่า) — เก็บไว้ให้ประวัติอ่านได้ */
  replaced_by_unit_id: string | null
  created_at: string
  categories?: Category
  suppliers?: Supplier
  product_lots?: ProductLot[]
  product_units?: ProductUnit[]
}

export interface Supplier {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
}

export type PurchaseStatus = 'pending' | 'received'

export interface Purchase {
  id: string
  purchase_number: string
  supplier_id: string | null
  total_cost: number
  notes: string | null
  status: PurchaseStatus
  received_at: string | null
  received_by: string | null
  created_by: string | null
  created_at: string
  suppliers?: Supplier
  purchase_items?: PurchaseItem[]
}

export interface PurchaseItem {
  id: string
  purchase_id: string
  product_id: string | null
  /** หน่วยที่สั่ง — null = หน่วยฐาน */
  product_unit_id: string | null
  unit_factor: number
  unit_name: string | null
  /** จำนวนหน่วยฐาน = quantity × unit_factor (DB คิดให้) */
  base_quantity: number
  received_base_quantity: number | null
  quantity: number
  received_quantity: number | null
  unit_cost: number
  lot_number: string | null
  supplier_lot_number: string | null
  expiry_date: string | null
  created_at: string
  products?: Product
}

// ข้อมูลร้าน (singleton) — ใส่หัวเอกสาร (ใบเสร็จ/ใบสั่งซื้อ)
export interface StoreSettings {
  id: string
  name: string
  address: string | null
  phone: string | null
  tax_id: string | null
  logo_url: string | null
  promptpay_id: string | null
  payment_qr_url: string | null
  /** ร้านจดทะเบียน VAT แล้วหรือยัง — ปิดอยู่ = ไม่แสดง VAT บนใบเสร็จเลย */
  vat_registered: boolean
  vat_rate: number
  /** ช่องทางติดต่อที่โชว์บนเว็บสาธารณะ */
  line_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  /** ปิดอยู่ = เว็บโชว์แค่ข่าว/ช่องทางติดต่อ ยังสั่งซื้อไม่ได้ */
  shop_enabled: boolean
  shop_intro: string | null
  pickup_note: string | null
  /** ยอดซื้อขั้นต่ำที่ส่งฟรี (null = ไม่มี) */
  free_shipping_min: number | null
  rounding_mode: RoundingMode
  /** เงินทอนที่ต้องเหลือไว้ในลิ้นชักทุกเช้า (null = ไม่ได้ตั้ง ใช้ยอดที่เหลือจริงแบบเดิม) */
  float_target: number | null
  /** เงินทอนแยกรายชนิด เช่น {"100":15,"20":40} — ตั้งไว้แล้วจะคุมได้ว่าเหลือเป็นแบงค์อะไรด้วย */
  float_denoms: Record<string, number> | null
  /** ชนิดที่เก็บไว้ทั้งหมด เช่น [50] — มีเท่าไหร่เก็บเท่านั้น ไม่หยิบออก ไม่เตือนว่าขาด */
  float_keep: number[] | null
  updated_at: string
}

export type StockMovementType = 'sale' | 'receive' | 'adjust_in' | 'adjust_out' | 'cancel'

export interface StockMovement {
  id: string
  product_id: string
  product_lot_id: string | null
  transaction_id: string | null
  type: StockMovementType
  quantity: number
  reason: string | null
  created_by: string | null
  created_at: string
  profiles?: Profile
}

export interface ProductLot {
  id: string
  product_id: string
  lot_number: string | null
  supplier_lot_number: string | null
  expiry_date: string | null
  quantity: number
  initial_quantity: number
  created_at: string
}

export type StockCountStatus = 'counting' | 'posted' | 'cancelled'

/** รอบนับสต็อก — เปิดค้างไว้ได้ หลายคนช่วยกันนับรอบเดียวกันได้ */
export interface StockCount {
  id: string
  count_number: string
  name: string | null
  /** null = นับทั้งร้าน, มีค่า = นับเฉพาะหมวดนั้น */
  category_id: string | null
  status: StockCountStatus
  note: string | null
  created_by: string | null
  created_at: string
  posted_by: string | null
  posted_at: string | null
  categories?: { name: string } | null
}

/** สินค้าหนึ่งตัวที่นับแล้วในรอบนั้น — จำนวนเป็นหน่วยฐานเสมอ */
export interface StockCountItem {
  id: string
  count_id: string
  product_id: string
  /** lot ที่นับ — null = นับรวมทุก lot แล้วปรับส่วนต่างแบบ FEFO */
  product_lot_id: string | null
  counted_quantity: number
  /** ยอดระบบ ณ ตอนบันทึกการนับ (ไม่ใช่ตอนกดยืนยัน) */
  system_quantity: number
  /** ส่วนต่างที่ปรับเข้าสต็อกจริงตอนยืนยัน — null = ยังไม่ยืนยัน */
  applied_diff: number | null
  /** วันหมดอายุที่อ่านจากกล่องตอนนับ — null = ไม่ได้กรอก */
  expiry_date: string | null
  note: string | null
  counted_by: string | null
  counted_at: string
}

export interface Customer {
  id: string
  name: string
  /** เลข HN เจ้าของ "YY####" (ปี พ.ศ. 2 หลัก + ลำดับในปีนั้น) — DB ออกให้ตอน insert */
  hn: string | null
  phone: string
  points: number
  total_spent: number
  credit_balance: number
  created_at: string
}

export type PetSpecies = 'dog' | 'cat' | 'bird' | 'rabbit' | 'rodent' | 'reptile' | 'other'

export const SPECIES_LABELS: Record<PetSpecies, string> = {
  dog: 'สุนัข',
  cat: 'แมว',
  bird: 'นก',
  rabbit: 'กระต่าย',
  rodent: 'หนู/แฮมสเตอร์',
  reptile: 'สัตว์เลื้อยคลาน',
  other: 'อื่นๆ',
}

/** ตัวเลือกพันธุ์ต่อชนิดสัตว์ — เพิ่มเองได้จากฟอร์มลงทะเบียน (เหมือนหน่วยสินค้า) */
export interface Breed {
  id: string
  species: PetSpecies
  /** ชื่อแสดงผล compose จาก "English / ไทย" (เก็บลง pets.breed) */
  name: string
  name_en: string | null
  name_th: string | null
  created_at: string
}

export interface Pet {
  id: string
  customer_id: string
  /** เลข HN สัตว์ "YY####-N" = HN เจ้าของ + ลำดับสัตว์ของเจ้าของคนนั้น */
  hn: string | null
  name: string
  species: PetSpecies
  breed: string | null
  sex: 'male' | 'female' | null
  birth_date: string | null
  color: string | null
  microchip: string | null
  sterilized: boolean
  /** วันที่ทำหมัน — ใช้คำนวณว่าทำตอนอายุเท่าไหร่ */
  sterilized_date: string | null
  /** ขึ้นเตือนหัวฟอร์มตรวจรักษา */
  allergies: string | null
  chronic_conditions: string | null
  notes: string | null
  photo_url: string | null
  active: boolean
  created_at: string
  customers?: Customer
}

/** waiting = ลงทะเบียนแล้วรอหมอเรียก, open = หมอกำลังตรวจ, pending_payment = รอแคชเชียร์เก็บเงิน */
export type VisitStatus = 'waiting' | 'open' | 'pending_payment' | 'paid' | 'cancelled'

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  waiting: 'รอตรวจ',
  open: 'กำลังตรวจ',
  pending_payment: 'รอเก็บเงิน',
  paid: 'เก็บเงินแล้ว',
  cancelled: 'ยกเลิก',
}

/** แคตตาล็อกชื่อโรค — เลือกจากรายการในหน้าตรวจรักษา เพิ่มใหม่ตรงนั้นได้ รวมโรคซ้ำได้ที่ /admin/diagnoses */
export interface Diagnosis {
  id: string
  /** ชื่อแสดงผล compose จาก "English / ไทย" */
  name: string
  name_en: string | null
  name_th: string | null
  created_at: string
}

/** โรคที่ผูกกับ visit — หนึ่ง visit มีได้หลายโรค */
export interface VisitDiagnosis {
  id: string
  visit_id: string
  diagnosis_id: string
  created_at: string
  diagnoses?: Diagnosis | null
}

export interface Visit {
  id: string
  visit_number: string
  pet_id: string
  customer_id: string | null
  vet_id: string | null
  visit_date: string
  weight: number | null
  temperature: number | null
  heart_rate: number | null
  resp_rate: number | null
  symptoms: string | null
  history_taking: string | null
  physical_exam: string | null
  /** รายละเอียดเพิ่มเติมที่หมอพิมพ์เอง — ชื่อโรคอยู่ใน visit_diagnoses */
  diagnosis: string | null
  /** สัตว์ปกติดี ไม่ได้ป่วย (วัคซีน/ตรวจสุขภาพ/หายแล้ว) */
  healthy: boolean
  treatment: string | null
  client_education: string | null
  notes: string | null
  follow_up_date: string | null
  status: VisitStatus
  transaction_id: string | null
  created_by: string | null
  created_at: string
  pets?: Pet
  customers?: Customer
  vet?: { name: string } | null
  visit_items?: VisitItem[]
  visit_diagnoses?: VisitDiagnosis[]
}

/** ความถี่การให้ยา — sid/bid/tid/qid = วันละ 1/2/3/4 ครั้ง, q_h = ทุกๆ n ชม., prn = เมื่อมีอาการ */
export type Frequency = 'sid' | 'bid' | 'tid' | 'qid' | 'q_h' | 'prn'
/** ac = ก่อนอาหาร, pc = หลังอาหาร, wm = พร้อมอาหาร */
export type FoodTiming = 'ac' | 'pc' | 'wm'

export interface VisitItem {
  id: string
  visit_id: string
  product_id: string | null
  quantity: number
  unit_price: number
  /** วิธีใช้ยา — พิมพ์ลงใบสรุปการรักษา */
  dosage: string | null
  /** จำนวนต่อครั้ง (รองรับเศษเม็ด เช่น 0.5) */
  dose_amount: number | null
  /** ยาฉีด: ปริมาณที่ฉีดจริงเป็น ml — คิดเงินปัดขึ้นเป็น ml เต็มที่ quantity */
  dose_ml: number | null
  frequency: Frequency | null
  /** ใช้เมื่อ frequency = 'q_h' */
  frequency_hours: number | null
  food_timing: FoodTiming | null
  duration_days: number | null
  /** เวลาที่ให้ยาในแต่ละวัน คั่นด้วยจุลภาค เช่น 'morning,evening' */
  dose_times: string | null
  created_at: string
  products?: Product
}

/** รายการจากคลินิกที่ส่งมารอเก็บเงินที่หน้าขาย (ผูก product เต็มก้อนมาแล้วเพื่อตัดสต็อค FEFO ได้) */
export interface ClinicQueueItem {
  quantity: number
  unit_price: number
  dosage: string | null
  product: Product
}

export interface ClinicQueueVisit {
  id: string
  visit_number: string
  pet_name: string
  customer: Customer | null
  items: ClinicQueueItem[]
}

export type BoosterType = '4w' | 'annual' | 'custom'

export const BOOSTER_LABELS: Record<BoosterType, string> = {
  '4w': 'ห่าง 4 สัปดาห์',
  annual: 'ประจำปี (วันเดิมปีถัดไป)',
  custom: 'กำหนดเอง (วัน)',
}

export interface Vaccine {
  id: string
  /** ชื่อแสดงผล "English / ไทย" */
  name: string
  name_en: string | null
  name_th: string | null
  /** null = ใช้ได้ทุกชนิด */
  species: PetSpecies | null
  default_interval_days: number
  created_at: string
}

export interface PetVaccination {
  id: string
  pet_id: string
  vaccine_id: string | null
  /** snapshot ชื่อวัคซีน ณ วันฉีด */
  vaccine_name: string
  dose_date: string
  dose_label: string | null
  next_due_date: string | null
  lot_number: string | null
  vet_id: string | null
  visit_id: string | null
  product_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  pets?: Pet
  vet?: { name: string } | null
}

export type AppointmentType = 'checkup' | 'vaccine' | 'surgery' | 'follow_up' | 'other'
export type AppointmentStatus = 'scheduled' | 'done' | 'missed' | 'cancelled'

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  checkup: 'ตรวจรักษา',
  vaccine: 'ฉีดวัคซีน',
  surgery: 'ผ่าตัด',
  follow_up: 'ติดตามอาการ',
  other: 'อื่นๆ',
}

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'นัดแล้ว',
  done: 'มาแล้ว',
  missed: 'ไม่มา',
  cancelled: 'ยกเลิก',
}

export interface Appointment {
  id: string
  pet_id: string
  customer_id: string | null
  vet_id: string | null
  scheduled_at: string
  type: AppointmentType
  status: AppointmentStatus
  notes: string | null
  visit_id: string | null
  created_by: string | null
  created_at: string
  pets?: Pet
  customers?: Customer
  vet?: { name: string } | null
}

export interface PointsConfig {
  id: string
  enabled: boolean
  spend_amount: number
  earn_points: number
  redeem_points: number
  redeem_value: number
  updated_at: string
}

export type PromotionType = 'percent_discount' | 'amount_discount' | 'buy_x_get_y'
export type ApplyTo = 'all' | 'categories' | 'products'
/** โปรนี้ใช้ขายที่ไหน — all = ทุกที่, store = หน้าร้านเท่านั้น, booth = งานออกบูธเท่านั้น */
export type ChannelScope = 'all' | 'store' | 'booth'
/** ลดเป็นบาท: per_unit = ลดต่อชิ้น, per_line = ลดครั้งเดียวต่อรายการในบิล */
export type AmountMode = 'per_unit' | 'per_line'

export interface Promotion {
  id: string
  name: string
  type: PromotionType
  discount_percent: number | null
  discount_amount: number | null
  amount_mode: AmountMode
  buy_quantity: number | null
  get_quantity: number | null
  /** เงื่อนไข "ซื้อครบ" ของรายการนั้น — null = ไม่มีเงื่อนไข */
  min_quantity: number | null
  min_amount: number | null
  /** เพดานส่วนลดต่อรายการ (บาท) — null = ไม่จำกัด */
  max_discount: number | null
  apply_to: ApplyTo
  /** สินค้า/หมวดที่โปรนี้คลุม — มาจากตารางเชื่อม promotion_products / promotion_categories */
  product_ids: string[]
  category_ids: string[]
  /** ใช้ได้ที่ไหน — โปรบูธเด้งเฉพาะตอนเปิดโหมดบูธ, โปรหน้าร้านไม่เด้งที่บูธ */
  channel_scope: ChannelScope
  start_date: string
  /** null = ไม่มีวันหมด — โปรบูธที่ใช้ซ้ำทุกรอบไม่ต้องมาต่ออายุทุกเดือน */
  end_date: string | null
  active: boolean
  created_at: string
}

export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr'
/** ช่องทางที่บิลนี้ขายออกไป — store = หน้าร้าน, booth = ยกของไปขายที่งาน, ที่เหลือคือ marketplace */
export type SalesChannel = 'store' | 'shopee' | 'tiktok' | 'lazada' | 'booth'
/** ปัดเศษสตางค์ท้ายบิล — none = ไม่ปัด, normal = .50 ขึ้นไปปัดขึ้น, up/down = ปัดขึ้น/ลงเสมอ */
export type RoundingMode = 'none' | 'normal' | 'up' | 'down'
export type TransactionStatus = 'completed' | 'cancelled'
export type RefundMethod = 'cash' | 'transfer' | 'credit'

export interface Transaction {
  id: string
  transaction_number: string
  cashier_id: string | null
  customer_id: string | null
  subtotal: number
  discount: number
  total: number
  payment_method: PaymentMethod
  cash_received: number | null
  change_given: number | null
  points_earned: number
  points_used: number
  credit_used: number
  notes: string | null
  status: TransactionStatus
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
  restocked: boolean | null
  refund_method: RefundMethod | null
  /** วิธีรับเงินที่บันทึกไว้ตอนขายครั้งแรก — มีค่าเมื่อมีคนแก้วิธีรับเงินภายหลัง */
  /** ส่วนต่างจากการปัดเศษท้ายบิล (+ ปัดขึ้น, − ปัดลง) */
  rounding: number
  sales_channel: SalesChannel
  /** เลขที่ออเดอร์ฝั่ง marketplace — มีเฉพาะบิลที่ไม่ใช่หน้าร้าน */
  external_order_no: string | null
  /** รอบออกบูธที่บิลนี้ขายได้ — มีเฉพาะ sales_channel = 'booth' */
  booth_trip_id: string | null
  payment_method_original: PaymentMethod | null
  payment_edited_at: string | null
  payment_edited_by: string | null
  created_at: string
  profiles?: Profile
  customers?: Customer
  transaction_items?: TransactionItem[]
  /** มีเฉพาะบิลที่เก็บเงินแยกหลายทาง — บิลจ่ายทางเดียวไม่มีแถวเลย (ดู src/lib/payments.ts) */
  transaction_payments?: TransactionPayment[]
}

/** เงินที่รับมาหนึ่งช่องทางของบิลที่แยกจ่าย — ผลรวมของบิลเท่ากับ transactions.total พอดี */
export interface TransactionPayment {
  id: string
  transaction_id: string
  method: PaymentMethod
  amount: number
  created_at: string
}

export interface TransactionItem {
  id: string
  transaction_id: string
  product_id: string
  product_lot_id: string | null
  /** หน่วยที่ขาย — null = หน่วยฐาน */
  product_unit_id: string | null
  unit_factor: number
  /** ชื่อหน่วย ณ ตอนขาย (null = หน่วยฐานของสินค้า) */
  unit_name: string | null
  /** จำนวนหน่วยฐานที่ตัดสต็อคจริง = quantity × unit_factor (DB คิดให้) — ใช้ตัวนี้ในรายงาน */
  base_quantity: number
  /** จำนวน "หน่วยที่ขาย" — 2 กล่อง คือ 2 */
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
  /** บันทึกไว้ตอนขาย ไม่ใช่ดูจากสินค้าตอนนี้ — สินค้าอาจถูกย้ายหมวด/แก้ทีหลัง */
  vat_applicable: boolean
  created_at: string
  products?: Product
}

/** เงินเข้า-ออกลิ้นชักระหว่างกะ — in = เติมเข้า, out = หยิบออก */
export interface CashMovement {
  id: string
  shift_id: string
  direction: 'in' | 'out'
  amount: number
  reason: string | null
  created_by: string | null
  created_at: string
  profiles?: { name: string } | null
}

export interface Shift {
  id: string
  opened_at: string
  opened_by: string | null
  opening_cash: number
  closed_at: string | null
  closed_by: string | null
  expected_cash: number | null
  closing_cash_counted: number | null
  cash_difference: number | null
  notes: string | null
  created_at: string
  opener?: { name: string } | null
  closer?: { name: string } | null
}

export type MarketplacePlatform = 'shopee' | 'tiktok' | 'lazada'

// ข้อมูล channel แบบไม่มีความลับ (ไม่มี partner_key/access_token/refresh_token) — ใช้แสดงผลฝั่ง client
export interface MarketplaceChannel {
  id: string
  platform: MarketplacePlatform
  shop_id: string | null
  shop_name: string | null
  active: boolean
  connected: boolean
  updated_at: string
}

export interface ProductMarketplaceLink {
  id: string
  product_id: string
  channel_id: string
  external_item_id: string
  external_model_id: string | null
  external_name: string | null
  sync_enabled: boolean
  last_synced_stock: number | null
  last_synced_at: string | null
  created_at: string
}

// ================= เว็บสาธารณะ + ร้านค้าออนไลน์ =================

export interface Announcement {
  id: string
  title: string
  body: string
  image_url: string | null
  /** ปิด = ร่าง ไม่ขึ้นหน้าเว็บ */
  published: boolean
  /** ปักหมุดขึ้นบนสุด */
  pinned: boolean
  published_at: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ShippingZone {
  id: string
  name: string
  provinces: string[]
  /** โซนสำรองของจังหวัดที่ไม่ได้ระบุไว้ที่ไหน */
  is_default: boolean
  sort_order: number
  created_at: string
}

export interface ShippingRate {
  id: string
  zone_id: string
  max_weight_grams: number
  price: number
  created_at: string
}

export interface ShippingZoneWithRates extends ShippingZone {
  shipping_rates?: ShippingRate[]
}

export interface CustomerAddress {
  id: string
  customer_id: string
  label: string | null
  recipient_name: string
  phone: string
  address_line: string
  subdistrict: string | null
  district: string | null
  province: string
  postal_code: string | null
  note: string | null
  is_default: boolean
  created_at: string
}

export type OrderStatus =
  | 'pending_payment'
  | 'awaiting_confirm'
  | 'confirmed'
  | 'shipped'
  | 'ready_pickup'
  | 'completed'
  | 'cancelled'

export type Fulfillment = 'delivery' | 'pickup'

export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  delivery: 'จัดส่งตามที่อยู่',
  pickup: 'มารับที่ร้าน',
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  unit: string | null
  unit_price: number
  quantity: number
  subtotal: number
  weight_grams: number
  created_at: string
  products?: Product
}

export interface Order {
  id: string
  order_number: string
  customer_id: string | null
  status: OrderStatus
  fulfillment: Fulfillment
  subtotal: number
  shipping_fee: number
  discount: number
  total: number
  total_weight_grams: number
  recipient_name: string | null
  phone: string | null
  address_line: string | null
  subdistrict: string | null
  district: string | null
  province: string | null
  postal_code: string | null
  shipping_zone_name: string | null
  customer_note: string | null
  staff_note: string | null
  /** path ในบัคเก็ต payment-slips (บัคเก็ตส่วนตัว — ต้องออก signed URL ฝั่ง server) */
  payment_slip_path: string | null
  paid_reported_at: string | null
  confirmed_at: string | null
  confirmed_by: string | null
  shipped_at: string | null
  tracking_carrier: string | null
  tracking_number: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
  transaction_id: string | null
  created_at: string
  customers?: Customer | null
  order_items?: OrderItem[]
}

/** สินค้าที่ขึ้นหน้าร้านออนไลน์ (ตัดข้อมูลต้นทุน/ซัพพลายเออร์ออก) */
export interface ShopProduct {
  id: string
  name: string
  sku: string | null
  price: number
  unit: string
  image_url: string | null
  online_description: string | null
  weight_grams: number | null
  is_service: boolean
  category_id: string | null
  category_name: string | null
  /** สต็อคคงเหลือรวมทุกล็อต (บริการ = null คือไม่จำกัด) */
  stock: number | null
}

// Cart types for POS
export interface CartItem {
  product: Product
  /** หน่วยที่ขาย — null = หน่วยฐานของสินค้า (products.unit) */
  unit: ProductUnit | null
  /** จำนวน "หน่วยที่เลือก" ไม่ใช่หน่วยฐาน — 2 กล่อง คือ 2 ตรงนี้ ส่วนสต็อคตัด 2 × factor */
  quantity: number
  unit_price: number
  /** ส่วนลดรวมของบรรทัดนี้ = โปรโมชั่น + ที่แคชเชียร์ลดเอง (ค่านี้คือที่บันทึกลง transaction_items) */
  discount: number
  /** ส่วนลดที่แคชเชียร์ใส่เองเป็นบาท (คำนวณแล้ว) — เก็บแยกจาก discount ไม่งั้นโปรโมชั่นคำนวณทับทุกครั้งที่แก้จำนวน */
  manual_discount: number
  /** เก็บว่ากรอกมาเป็นบาทหรือ % พร้อมตัวเลขดิบ — ต้องคิดใหม่ทุกครั้งที่จำนวนเปลี่ยน ไม่งั้น % ค้างที่ยอดเดิม */
  discount_mode: 'amount' | 'percent'
  discount_value: number
  subtotal: number
  /** โปรที่ถูกเลือกให้บรรทัดนี้ (อันที่ลดเยอะสุด) — ไว้ขึ้นชื่อให้แคชเชียร์เห็น ไม่ได้บันทึกลงบิล */
  promo_name?: string | null
  promo_discount?: number
  lot_id: string | null
}

// ───────────────────────────────────────────────────────────────
// งานออกบูธ — ยกของไปขายนอกร้านเดือนละครั้ง ราคาคนละชุดกับหน้าร้าน
// ───────────────────────────────────────────────────────────────
export type BoothTripStatus = 'open' | 'closed'

export interface BoothTrip {
  id: string
  trip_number: string
  name: string | null
  location: string | null
  trip_date: string
  status: BoothTripStatus
  opened_at: string
  opened_by: string | null
  closed_at: string | null
  closed_by: string | null
  /** เงินทอนที่เตรียมแยกไปต่างหาก — ไม่เกี่ยวกับเก๊ะที่ร้าน */
  float_cash: number
  /** เงินสดที่นับได้ตอนกลับ (null = ยังไม่ได้นับ) */
  cash_counted: number | null
  booth_fee: number
  travel_cost: number
  other_cost: number
  other_cost_note: string | null
  notes: string | null
  created_at: string
  opener?: Profile
  closer?: Profile
}

export interface BoothTripItem {
  id: string
  trip_id: string
  product_id: string
  taken_quantity: number
  /** null = ยังไม่ได้กรอกใบคืน */
  returned_quantity: number | null
  created_at: string
  products?: Product
}
