'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PackageSearch, Plus, Search, Truck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCart } from '@/lib/use-cart'
import type { ShopProduct } from '@/lib/types'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  products: ShopProduct[]
  freeShippingMin: number | null
  pickupNote: string | null
}

export default function ShopClient({ products, freeShippingMin, pickupNote }: Props) {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const cart = useCart()

  const categories = useMemo(() => {
    const map = new Map<string, string>()
    products.forEach((p) => {
      if (p.category_id && p.category_name) map.set(p.category_id, p.category_name)
    })
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (categoryId && p.category_id !== categoryId) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)
    })
  }, [products, query, categoryId])

  function addToCart(product: ShopProduct) {
    cart.add({
      productId: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit,
      imageUrl: product.image_url,
      weightGrams: product.weight_grams ?? 0,
    })
    toast.success(`เพิ่ม "${product.name}" ลงตะกร้าแล้ว`)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">สั่งซื้อสินค้า</h1>
        {freeShippingMin != null && freeShippingMin > 0 && (
          <p className="inline-flex items-center gap-1.5 text-sm text-brand-brown font-medium">
            <Truck size={16} /> ซื้อครบ ฿{money(freeShippingMin)} ส่งฟรี
          </p>
        )}
      </div>

      {pickupNote && (
        <p className="rounded-xl bg-white border border-brand-muted/30 px-4 py-3 text-sm text-gray-600">
          {pickupNote}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาสินค้า"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-brand-muted/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-brown/40"
          />
        </div>
        {categories.length > 0 && (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-brand-muted/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-brown/40"
          >
            <option value="">ทุกหมวดหมู่</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white border border-brand-muted/30 p-10 text-center text-gray-500">
          <PackageSearch size={32} className="mx-auto mb-2 text-brand-muted" />
          <p className="text-sm">ไม่พบสินค้าที่ค้นหา</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => {
            const soldOut = product.stock !== null && product.stock <= 0
            return (
              <div key={product.id} className="rounded-xl bg-white border border-brand-muted/30 overflow-hidden flex flex-col">
                <Link href={`/shop/${product.id}`} className="block">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt={product.name} className="w-full aspect-square object-cover" />
                  ) : (
                    <div className="w-full aspect-square bg-brand-light flex items-center justify-center text-brand-muted">
                      <PackageSearch size={28} />
                    </div>
                  )}
                </Link>

                <div className="p-3 flex-1 flex flex-col">
                  <Link href={`/shop/${product.id}`} className="font-medium text-sm text-brand-dark line-clamp-2 hover:text-brand-brown">
                    {product.name}
                  </Link>
                  <p className="mt-1 text-xs text-gray-400">
                    {product.stock !== null && product.stock > 0
                      ? `เหลือ ${product.stock} ${product.unit}`
                      : `ต่อ 1 ${product.unit}`}
                  </p>
                  <p className="mt-2 mb-3 font-bold text-brand-dark">฿{money(product.price)}</p>

                  <button
                    type="button"
                    disabled={soldOut}
                    onClick={() => addToCart(product)}
                    className="mt-auto w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-brand-brown text-white text-sm font-medium disabled:bg-gray-200 disabled:text-gray-400 hover:opacity-90"
                  >
                    {soldOut ? 'สินค้าหมด' : (<><Plus size={15} /> ใส่ตะกร้า</>)}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
