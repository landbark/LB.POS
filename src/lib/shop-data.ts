import { createAdminClient } from '@/lib/supabase/admin'
import { isClinicOnly } from '@/lib/clinic'
import { getReservedQuantities } from '@/lib/order-stock'
import type { Announcement, ShopProduct, ShippingZoneWithRates } from '@/lib/types'

// ตัวช่วยอ่านข้อมูลสำหรับหน้าเว็บสาธารณะ — ผู้เข้าชมไม่มี session Supabase
// จึงอ่านผ่าน service role ฝั่ง server และเลือกเฉพาะคอลัมน์ที่เปิดเผยได้

/** ข้อมูลร้านที่โชว์บนเว็บได้ (ไม่ดึงเลขผู้เสียภาษี/ค่าตั้งค่าภายใน) */
export interface Storefront {
  name: string
  address: string | null
  phone: string | null
  logo_url: string | null
  line_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  shop_enabled: boolean
  shop_intro: string | null
  pickup_note: string | null
  free_shipping_min: number | null
  promptpay_id: string | null
  payment_qr_url: string | null
}

export async function getStorefront(): Promise<Storefront | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('store_settings')
    .select(
      'name, address, phone, logo_url, line_url, facebook_url, instagram_url, shop_enabled, shop_intro, pickup_note, free_shipping_min, promptpay_id, payment_qr_url'
    )
    .limit(1)
    .maybeSingle()
  return data as Storefront | null
}

export async function getAnnouncements(limit = 20): Promise<Announcement[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('announcements')
    .select('*')
    .eq('published', true)
    .order('pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as Announcement[]
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('announcements')
    .select('*')
    .eq('id', id)
    .eq('published', true)
    .maybeSingle()
  return data as Announcement | null
}

const SHOP_PRODUCT_COLUMNS =
  'id, name, sku, price, unit, image_url, online_description, weight_grams, is_service, clinic_only, category_id, categories(id, name, clinic_only), product_lots(quantity)'

interface RawShopProduct {
  id: string
  name: string
  sku: string | null
  price: number
  unit: string
  image_url: string | null
  online_description: string | null
  weight_grams: number | null
  is_service: boolean
  clinic_only: boolean | null
  category_id: string | null
  categories: { id: string; name: string; clinic_only: boolean } | null
  product_lots: { quantity: number }[] | null
}

function toShopProduct(row: RawShopProduct, reserved = 0): ShopProduct {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    price: Number(row.price),
    unit: row.unit,
    image_url: row.image_url,
    online_description: row.online_description,
    weight_grams: row.weight_grams,
    is_service: row.is_service,
    category_id: row.category_id,
    category_name: row.categories?.name ?? null,
    stock: row.is_service
      ? null
      : Math.max(0, (row.product_lots ?? []).reduce((sum, lot) => sum + (lot.quantity ?? 0), 0) - reserved),
  }
}

/** สินค้าที่ขึ้นเว็บ — ต้องเปิด online_available, ยัง active และไม่ใช่ของคลินิก */
export async function getShopProducts(): Promise<ShopProduct[]> {
  const admin = createAdminClient()
  const [{ data }, reserved] = await Promise.all([
    admin
      .from('products')
      .select(SHOP_PRODUCT_COLUMNS)
      .eq('active', true)
      .eq('online_available', true)
      .order('name'),
    getReservedQuantities(),
  ])

  return ((data ?? []) as unknown as RawShopProduct[])
    .filter((row) => !isClinicOnly({ clinic_only: row.clinic_only, categories: row.categories }))
    .map((row) => toShopProduct(row, reserved.get(row.id) ?? 0))
}

export async function getShopProduct(id: string): Promise<ShopProduct | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('products')
    .select(SHOP_PRODUCT_COLUMNS)
    .eq('id', id)
    .eq('active', true)
    .eq('online_available', true)
    .maybeSingle()

  if (!data) return null
  const row = data as unknown as RawShopProduct
  if (isClinicOnly({ clinic_only: row.clinic_only, categories: row.categories })) return null
  const reserved = await getReservedQuantities()
  return toShopProduct(row, reserved.get(row.id) ?? 0)
}

export async function getShippingZones(): Promise<ShippingZoneWithRates[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('shipping_zones')
    .select('*, shipping_rates(*)')
    .order('sort_order')
  return (data ?? []) as ShippingZoneWithRates[]
}
