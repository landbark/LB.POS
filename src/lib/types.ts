export type Role = 'admin' | 'cashier'

export interface Profile {
  id: string
  role: Role
  name: string
  created_at: string
}

export interface Category {
  id: string
  name: string
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
  notes: string | null
  created_at: string
}

export interface Purchase {
  id: string
  purchase_number: string
  supplier_id: string | null
  total_cost: number
  notes: string | null
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
  unit_cost: number
  lot_number: string | null
  supplier_lot_number: string | null
  expiry_date: string | null
  created_at: string
  products?: Product
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
  created_at: string
}

export interface PointsConfig {
  id: string
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
  notes: string | null
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
  created_at: string
  products?: Product
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
