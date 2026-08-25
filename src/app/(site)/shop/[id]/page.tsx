import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, PackageSearch } from 'lucide-react'
import { getShopProduct, getStorefront } from '@/lib/shop-data'
import AddToCart from './AddToCart'

export const dynamic = 'force-dynamic'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function ShopProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [store, product] = await Promise.all([getStorefront(), getShopProduct(id)])
  if (!store?.shop_enabled || !product) notFound()

  const soldOut = product.stock !== null && product.stock <= 0

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/shop" className="inline-flex items-center gap-1 text-sm text-brand-brown hover:underline">
        <ArrowLeft size={14} /> กลับไปหน้าสินค้า
      </Link>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl overflow-hidden bg-white border border-brand-muted/30">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt={product.name} className="w-full aspect-square object-cover" />
          ) : (
            <div className="w-full aspect-square bg-brand-light flex items-center justify-center text-brand-muted">
              <PackageSearch size={40} />
            </div>
          )}
        </div>

        <div>
          {product.category_name && (
            <p className="text-xs text-brand-brown font-medium">{product.category_name}</p>
          )}
          <h1 className="mt-1 text-xl font-bold text-brand-dark">{product.name}</h1>
          <p className="mt-3 text-2xl font-bold text-brand-dark">฿{money(product.price)}</p>
          <p className="mt-1 text-sm text-gray-500">ต่อ 1 {product.unit}</p>

          <p className={`mt-2 text-sm ${soldOut ? 'text-red-600' : 'text-green-700'}`}>
            {product.stock === null
              ? 'พร้อมให้บริการ'
              : soldOut
                ? 'สินค้าหมด'
                : `เหลือ ${product.stock} ${product.unit}`}
          </p>

          <div className="mt-5">
            <AddToCart product={product} />
          </div>

          {product.online_description && (
            <div className="mt-6 text-sm leading-6 text-gray-700 whitespace-pre-line">
              {product.online_description}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
