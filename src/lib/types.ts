export type Role = 'admin' | 'cashier' | 'vet'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'เจ้าของร้าน',
  cashier: 'พนักงานขาย',
  vet: 'สัตวแพทย์',
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
  created_at: string
}

export interface Unit {
  id: string
  name: string
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
  cost: number | null
  unit: string
  min_stock: number
  /** null = ใช้ตามหมวดหมู่, true/false = ตั้งแยกเฉพาะสินค้าตัวนี้ */
  vat_applicable: boolean | null
  /** null = ใช้ตามหมวดหมู่ */
  clinic_only: boolean | null
  /** ค่าตรวจ/ค่าหัตถการ — ขายได้ตามปกติ แต่ไม่มีสต็อคให้ตัด */
  is_service: boolean
  image_url: string | null
  active: boolean
  created_at: string
  categories?: Category
  suppliers?: Supplier
  product_lots?: ProductLot[]
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

export interface Customer {
  id: string
  name: string
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
  name: string
  created_at: string
}

export interface Pet {
  id: string
  customer_id: string
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
  diagnosis: string | null
  treatment: string | null
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
}

export interface VisitItem {
  id: string
  visit_id: string
  product_id: string | null
  quantity: number
  unit_price: number
  /** วิธีใช้ยา — พิมพ์ลงใบสรุปการรักษา */
  dosage: string | null
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

export interface PointsConfig {
  id: string
  enabled: boolean
  spend_amount: number
  earn_points: number
  redeem_points: number
  redeem_value: number
  updated_at: string
}

export type PromotionType = 'percent_discount' | 'buy_x_get_y'
export type ApplyTo = 'all' | 'category' | 'product'

export interface Promotion {
  id: string
  name: string
  type: PromotionType
  discount_percent: number | null
  buy_quantity: number | null
  get_quantity: number | null
  apply_to: ApplyTo
  category_id: string | null
  product_id: string | null
  start_date: string
  end_date: string
  active: boolean
  created_at: string
}

export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr'
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
  created_at: string
  profiles?: Profile
  customers?: Customer
  transaction_items?: TransactionItem[]
}

export interface TransactionItem {
  id: string
  transaction_id: string
  product_id: string
  product_lot_id: string | null
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
  /** บันทึกไว้ตอนขาย ไม่ใช่ดูจากสินค้าตอนนี้ — สินค้าอาจถูกย้ายหมวด/แก้ทีหลัง */
  vat_applicable: boolean
  created_at: string
  products?: Product
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

// Cart types for POS
export interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
  lot_id: string | null
}
