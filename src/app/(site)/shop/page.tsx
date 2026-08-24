import { getShopProducts, getStorefront } from '@/lib/shop-data'
import ShopClient from './ShopClient'

export const dynamic = 'force-dynamic'

export default async function ShopPage() {
  const [store, products] = await Promise.all([getStorefront(), getShopProducts()])

  if (!store?.shop_enabled) {
    return (
      <div className="rounded-xl bg-white border border-brand-muted/30 p-8 text-center">
        <h1 className="text-lg font-bold text-brand-dark">ร้านค้าออนไลน์ปิดรับออเดอร์ชั่วคราว</h1>
        <p className="mt-2 text-sm text-gray-500">ติดต่อร้านทางไลน์หรือโทรศัพท์เพื่อสั่งซื้อได้เลย</p>
      </div>
    )
  }

  return (
    <ShopClient
      products={products}
      freeShippingMin={store.free_shipping_min}
      pickupNote={store.pickup_note}
    />
  )
}
