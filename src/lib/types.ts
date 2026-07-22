export type Role = 'admin' | 'cashier'

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
