'use client'

import Link from 'next/link'
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useCart } from '@/lib/use-cart'
import { formatWeightApprox } from '@/lib/shop'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CartPage() {
  const cart = useCart()

  if (cart.items.length === 0) {
    return (
      <div className="max-w-lg mx-auto rounded-xl bg-white border border-brand-muted/30 p-10 text-center">
        <ShoppingBag size={32} className="mx-auto mb-3 text-brand-muted" />
        <p className="text-gray-500">ยังไม่มีสินค้าในตะกร้า</p>
        <Link href="/shop" className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-brand-brown text-white text-sm font-medium">
          เลือกซื้อสินค้า
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-brand-dark">ตะกร้าของฉัน</h1>

      <div className="rounded-xl bg-white border border-brand-muted/30 divide-y divide-brand-muted/20">
        {cart.items.map((item) => (
          <div key={item.productId} className="p-4 flex gap-3">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-brand-light shrink-0" />
            )}

            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-brand-dark line-clamp-2">{item.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">฿{money(item.price)} / {item.unit}</p>

              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center border border-brand-muted/40 rounded-lg">
                  <button
                    type="button"
                    onClick={() => cart.setQuantity(item.productId, item.quantity - 1)}
                    className="px-2.5 py-1.5 hover:bg-brand-light"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-9 text-center text-sm">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => cart.setQuantity(item.productId, item.quantity + 1)}
                    className="px-2.5 py-1.5 hover:bg-brand-light"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => cart.remove(item.productId)}
                  className="p-1.5 text-gray-400 hover:text-red-600"
                  aria-label="ลบออกจากตะกร้า"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <p className="font-semibold text-brand-dark whitespace-nowrap">
              ฿{money(item.price * item.quantity)}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white border border-brand-muted/30 p-4 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>น้ำหนักรวมโดยประมาณ</span>
          <span>{formatWeightApprox(cart.weightGrams)}</span>
        </div>
        <div className="flex justify-between font-semibold text-brand-dark">
          <span>ยอดรวมสินค้า</span>
          <span>฿{money(cart.subtotal)}</span>
        </div>
        <p className="text-xs text-gray-400">ค่าส่งคำนวณในขั้นตอนถัดไป ตามน้ำหนักและจังหวัดปลายทาง</p>
      </div>

      <div className="flex gap-3">
        <Link href="/shop" className="px-4 py-3 rounded-xl border border-brand-muted/40 text-sm text-brand-dark">
          เลือกซื้อต่อ
        </Link>
        <Link
          href="/checkout"
          className="flex-1 text-center py-3 rounded-xl bg-brand-brown text-white font-medium hover:opacity-90"
        >
          ไปชำระเงิน
        </Link>
      </div>
    </div>
  )
}
