'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCart } from '@/lib/use-cart'
import type { ShopProduct } from '@/lib/types'

export default function AddToCart({ product }: { product: ShopProduct }) {
  const router = useRouter()
  const cart = useCart()
  const [quantity, setQuantity] = useState(1)

  const max = product.stock ?? 999
  const soldOut = product.stock !== null && product.stock <= 0

  function add(goToCart: boolean) {
    cart.add(
      {
        productId: product.id,
        name: product.name,
        price: product.price,
        unit: product.unit,
        imageUrl: product.image_url,
        weightGrams: product.weight_grams ?? 0,
      },
      quantity
    )
    if (goToCart) router.push('/cart')
    else toast.success('เพิ่มลงตะกร้าแล้ว')
  }

  if (soldOut) {
    return (
      <button disabled className="w-full py-3 rounded-xl bg-gray-200 text-gray-400 font-medium">
        สินค้าหมด
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">จำนวน</span>
        <div className="flex items-center border border-brand-muted/40 rounded-lg bg-white">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-3 py-2 text-brand-dark hover:bg-brand-light"
          >
            <Minus size={14} />
          </button>
          <input
            type="number"
            min={1}
            max={max}
            value={quantity}
            onChange={(e) => setQuantity(Math.min(max, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-14 text-center text-sm py-2 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(max, q + 1))}
            className="px-3 py-2 text-brand-dark hover:bg-brand-light"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => add(false)}
          className="flex-1 py-3 rounded-xl border border-brand-brown text-brand-brown font-medium hover:bg-brand-light"
        >
          ใส่ตะกร้า
        </button>
        <button
          type="button"
          onClick={() => add(true)}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-brown text-white font-medium hover:opacity-90"
        >
          <ShoppingBag size={18} /> สั่งซื้อเลย
        </button>
      </div>
    </div>
  )
}
