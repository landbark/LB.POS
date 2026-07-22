'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, X, Plus, Minus, ShoppingCart, User, MonitorPlay, Stethoscope } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Product, CartItem, Promotion, PointsConfig, Customer, PaymentMethod, ClinicQueueVisit } from '@/lib/types'
import { POS_DISPLAY_CHANNEL, type PosDisplayMessage } from '@/lib/posDisplay'
import PaymentModal from './PaymentModal'

interface Props {
  products: Product[]
  promotions: Promotion[]
  pointsConfig: PointsConfig | null
  cashierId: string
  promptpayId: string | null
  clinicQueue: ClinicQueueVisit[]
}

export default function POSClient({ products, promotions, pointsConfig, cashierId, promptpayId, clinicQueue }: Props) {
  const router = useRouter()
  // เวชระเบียนที่กำลังเก็บเงินอยู่ — จ่ายเสร็จแล้วจะถูก mark เป็น paid พร้อมผูกเลขที่บิล
  const [activeVisit, setActiveVisit] = useState<ClinicQueueVisit | null>(null)
  const [showQueue, setShowQueue] = useState(false)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerPhone, setCustomerPhone] = useState('')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // ยิงบาร์โค้ด/พิมพ์จากที่ไหนก็ได้ในหน้าขาย — เด้ง focus เข้าช่องค้นหาให้อัตโนมัติ
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (showPayment) return // อย่าแย่ง focus ตอน modal ชำระเงินเปิดอยู่
      const t = e.target as HTMLElement
      if (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      ) return
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showPayment])

  // Get unique categories from products
  const categories = Array.from(
    new Map(
      products
        .filter((p) => p.categories)
        .map((p) => [(p.categories as any).name, (p.categories as any).name])
    ).values()
  )

  const filtered = products.filter((p) => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search))
    const matchCategory = !categoryFilter || (p.categories as any)?.name === categoryFilter
    // ค่าตรวจ/ค่าหัตถการไม่มีสต็อค — ขายได้เสมอ
    const hasStock = p.is_service || (p.product_lots ?? []).reduce((s: number, l: any) => s + l.quantity, 0) > 0
    return matchSearch && matchCategory && hasStock
  })

  function getProductStock(product: Product): number {
    // บริการ (ค่าตรวจ/ค่าหัตถการ) ไม่มีล็อตให้ตัด — ไม่จำกัดจำนวนที่ขายได้
    if (product.is_service) return Infinity
    return (product.product_lots ?? []).reduce((s: number, l: any) => s + l.quantity, 0)
  }

  // Pick the lot with the earliest expiry (FEFO) with stock
  function getBestLot(product: Product): string | null {
    const lots = (product.product_lots ?? [])
      .filter((l: any) => l.quantity > 0)
      .sort((a: any, b: any) => {
        if (!a.expiry_date) return 1
        if (!b.expiry_date) return -1
        return a.expiry_date.localeCompare(b.expiry_date)
      })
    return lots[0]?.id ?? null
  }

  function applyPromotion(product: Product, quantity: number): number {
    let discount = 0

    for (const promo of promotions) {
      const applies =
        promo.apply_to === 'all' ||
        (promo.apply_to === 'product' && promo.product_id === product.id) ||
        (promo.apply_to === 'category' && promo.category_id === (product as any).category_id)

      if (!applies) continue

      if (promo.type === 'percent_discount' && promo.discount_percent) {
        discount = (product.price * quantity * promo.discount_percent) / 100
      } else if (
        promo.type === 'buy_x_get_y' &&
        promo.buy_quantity &&
        promo.get_quantity
      ) {
        const sets = Math.floor(quantity / promo.buy_quantity)
        const freeQty = Math.min(sets * promo.get_quantity, quantity - sets * promo.buy_quantity)
        discount = freeQty * product.price
      }
    }

    return discount
  }

  function addToCart(product: Product) {
    const maxStock = getProductStock(product)
    const existing = cart.findIndex((c) => c.product.id === product.id)
    if (existing >= 0) {
      const newCart = [...cart]
      const item = newCart[existing]
      const newQty = item.quantity + 1
      if (newQty > maxStock) {
        toast.error(`สต็อคคงเหลือ ${maxStock} ${product.unit}`)
        return
      }
      const discount = applyPromotion(product, newQty)
      newCart[existing] = {
        ...item,
        quantity: newQty,
        discount,
        subtotal: product.price * newQty - discount,
      }
      setCart(newCart)
    } else {
      const lot_id = getBestLot(product)
      const discount = applyPromotion(product, 1)
      setCart([
        ...cart,
        {
          product,
          quantity: 1,
          unit_price: product.price,
          discount,
          subtotal: product.price - discount,
          lot_id,
        },
      ])
    }
  }

  // ดึงรายการที่หมอสั่งจ่ายเข้าตะกร้า — ราคาใช้ตามที่บันทึกไว้ในเวชระเบียน ไม่ใช่ราคาสินค้าปัจจุบัน
  function loadVisit(visit: ClinicQueueVisit) {
    if (cart.length > 0 && !confirm('ตะกร้ามีของอยู่แล้ว — แทนที่ด้วยรายการจากคลินิก?')) return

    const short = visit.items.filter((i) => !i.product.is_service && getProductStock(i.product) < i.quantity)
    if (short.length > 0) {
      toast.error(`สต็อคไม่พอ: ${short.map((i) => i.product.name).join(', ')}`)
    }

    setCart(visit.items.map((i) => ({
      product: i.product,
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount: 0,
      subtotal: i.unit_price * i.quantity,
      lot_id: getBestLot(i.product),
    })))
    setCustomer(visit.customer)
    setCustomerPhone(visit.customer?.phone ?? '')
    setShowAddCustomer(false)
    setActiveVisit(visit)
    setShowQueue(false)
  }

  function changeQty(index: number, delta: number) {
    const newCart = [...cart]
    const item = newCart[index]
    const newQty = item.quantity + delta
    if (newQty <= 0) {
      newCart.splice(index, 1)
    } else {
      // เช็คสต็อคเฉพาะตอนเพิ่ม — การลดต้องทำได้เสมอ
      if (delta > 0) {
        const maxStock = getProductStock(item.product)
        if (newQty > maxStock) {
          toast.error(`สต็อคคงเหลือ ${maxStock} ${item.product.unit}`)
          return
        }
      }
      const discount = applyPromotion(item.product, newQty)
      newCart[index] = {
        ...item,
        quantity: newQty,
        discount,
        subtotal: item.unit_price * newQty - discount,
      }
    }
    setCart(newCart)
  }

  // พิมพ์จำนวนตรงๆ ในตะกร้า — clamp ไม่ให้เกินสต็อคและไม่ต่ำกว่า 1
  function setQty(index: number, raw: string) {
    if (raw === '') return
    let n = parseInt(raw)
    if (isNaN(n)) return
    const item = cart[index]
    const maxStock = getProductStock(item.product)
    if (n > maxStock) {
      toast.error(`สต็อคคงเหลือ ${maxStock} ${item.product.unit}`)
      n = maxStock
    }
    if (n < 1) n = 1
    const discount = applyPromotion(item.product, n)
    const newCart = [...cart]
    newCart[index] = {
      ...item,
      quantity: n,
      discount,
      subtotal: item.unit_price * n - discount,
    }
    setCart(newCart)
  }

  async function searchCustomer() {
    if (!customerPhone) return
    const supabase = createClient()
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', customerPhone)
      .single()

    if (data) {
      setCustomer(data)
      setShowAddCustomer(false)
      toast.success(pointsConfig ? `พบลูกค้า: ${data.name} (${data.points} แต้ม)` : `พบลูกค้า: ${data.name}`)
    } else {
      toast.error('ไม่พบลูกค้า — เพิ่มใหม่ได้เลย')
      setShowAddCustomer(true)
      setNewCustomerName('')
    }
  }

  async function addCustomer() {
    if (!newCustomerName.trim()) {
      toast.error('กรุณาใส่ชื่อลูกค้า')
      return
    }
    const supabase = createClient()
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: newCustomerName.trim(), phone: customerPhone })
      .select('*')
      .single()

    if (error || !data) {
      toast.error(error?.code === '23505' ? 'เบอร์นี้มีลูกค้าอยู่แล้ว' : 'เพิ่มลูกค้าไม่สำเร็จ')
      return
    }
    setCustomer(data)
    setShowAddCustomer(false)
    setNewCustomerName('')
    toast.success('เพิ่มลูกค้าใหม่แล้ว')
  }

  // Enter ในช่องค้นหา: บาร์โค้ดตรงเป๊ะ หรือผลค้นหาเหลือตัวเดียว → เข้าตะกร้าทันที (รองรับเครื่องยิงบาร์โค้ด)
  function handleSearchEnter() {
    const q = search.trim()
    if (!q) return
    const exact = products.find(
      (p) =>
        p.barcode === q &&
        (p.product_lots ?? []).reduce((s: number, l: any) => s + l.quantity, 0) > 0
    )
    const target = exact ?? (filtered.length === 1 ? filtered[0] : null)
    if (target) {
      addToCart(target)
      setSearch('')
    } else if (filtered.length === 0) {
      toast.error('ไม่พบสินค้า')
    }
  }

  const subtotal = cart.reduce((s, item) => s + item.product.price * item.quantity, 0)
  const totalDiscount = cart.reduce((s, item) => s + item.discount, 0)
  const total = subtotal - totalDiscount

  // จอสอง (customer display) — เปิด BroadcastChannel ไว้ตลอด ส่งสถานะตะกร้าปัจจุบันให้จอลูกค้าเห็นแบบเรียลไทม์
  const displayChannelRef = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    displayChannelRef.current = new BroadcastChannel(POS_DISPLAY_CHANNEL)
    return () => displayChannelRef.current?.close()
  }, [])

  useEffect(() => {
    if (showPayment) return // ตอนจ่ายเงิน ให้ PaymentModal เป็นคนส่งสถานะแทน
    const earnedPoints = pointsConfig && total > 0
      ? Math.floor(total / pointsConfig.spend_amount) * pointsConfig.earn_points
      : 0
    const msg: PosDisplayMessage = {
      stage: 'cart',
      items: cart.map((item) => ({
        name: item.product.name,
        unit: item.product.unit,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
      })),
      subtotal,
      discount: totalDiscount,
      total,
      customer: customer && pointsConfig
        ? { name: customer.name, pointsBefore: customer.points, pointsEarned: earnedPoints, pointsAfter: customer.points + earnedPoints }
        : null,
    }
    displayChannelRef.current?.postMessage(msg)
  }, [cart, customer, subtotal, totalDiscount, total, pointsConfig, showPayment])

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left: Product Grid */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        {/* Search + Filter */}
        <div className="p-4 bg-white border-b border-gray-200 space-y-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchEnter() } }}
              placeholder="ค้นหาสินค้า หรือสแกนบาร์โค้ด..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <button
              onClick={() => setCategoryFilter('')}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                !categoryFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ทั้งหมด
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  cat === categoryFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((product) => {
              const stock = getProductStock(product)
              const inCart = cart.find((c) => c.product.id === product.id)
              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`bg-white rounded-xl p-3 text-left border-2 transition-all hover:shadow-md active:scale-95 ${
                    inCart ? 'border-blue-500' : 'border-transparent'
                  }`}
                >
                  <div className="w-full aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center text-3xl overflow-hidden">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      '🐾'
                    )}
                  </div>
                  <p className="text-xs font-medium text-gray-900 line-clamp-2 leading-tight mb-1">
                    {product.name}
                  </p>
                  <p className="text-sm font-bold text-blue-600">
                    ฿{product.price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {product.is_service ? 'บริการ' : `คงเหลือ ${stock}`}
                  </p>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-400 text-sm">
                ไม่พบสินค้า
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
        {/* คิวเก็บเงินจากคลินิก */}
        {clinicQueue.length > 0 && !activeVisit && (
          <div className="px-3 pt-3">
            <button
              onClick={() => setShowQueue(true)}
              className="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              <Stethoscope size={15} />
              รอเก็บเงินจากคลินิก ({clinicQueue.length})
            </button>
          </div>
        )}
        {activeVisit && (
          <div className="px-3 pt-3">
            <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-800 truncate">
                  คลินิก: {activeVisit.pet_name || 'ไม่ระบุสัตว์'}
                </p>
                <p className="text-[11px] text-amber-600 font-mono">{activeVisit.visit_number}</p>
              </div>
              <button
                onClick={() => { setActiveVisit(null); setCart([]) }}
                title="ยกเลิกการเก็บเงินรายการนี้"
                className="text-amber-500 hover:text-amber-700 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        {/* จอสอง */}
        <div className="px-3 pt-3">
          <button
            onClick={() => window.open('/pos-display', 'landbark-customer-display', 'width=1000,height=750')}
            className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-medium py-1.5 rounded-lg transition-colors"
          >
            <MonitorPlay size={14} />
            โชว์จอสอง (ให้ลูกค้าดู)
          </button>
        </div>
        {/* Customer */}
        <div className="p-3 border-b border-gray-100">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCustomer()}
                placeholder="เบอร์โทรลูกค้า"
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={searchCustomer}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors"
            >
              ค้นหา
            </button>
          </div>
          {customer && (
            <div className="mt-2 flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{customer.name}</p>
                {pointsConfig && <p className="text-xs text-blue-600">{customer.points} แต้ม</p>}
              </div>
              <button
                onClick={() => { setCustomer(null); setCustomerPhone(''); setShowAddCustomer(false) }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {!customer && showAddCustomer && (
            <div className="mt-2 bg-orange-50 rounded-lg p-2.5 space-y-2">
              <p className="text-xs text-orange-700">ไม่พบลูกค้าเบอร์ {customerPhone} — เพิ่มลูกค้าใหม่?</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomer()}
                  placeholder="ชื่อลูกค้า"
                  className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={addCustomer}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium"
                >
                  บันทึก
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <ShoppingCart size={40} />
              <p className="text-sm mt-2">ยังไม่มีสินค้า</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cart.map((item, i) => (
                <div key={item.product.id} className="px-3 py-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm font-medium text-gray-900 flex-1 leading-tight">
                      {item.product.name}
                    </p>
                    <button
                      onClick={() => changeQty(i, -item.quantity)}
                      className="text-gray-300 hover:text-red-500 shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => changeQty(i, -1)}
                        className="w-6 h-6 flex items-center justify-center border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => setQty(i, e.target.value)}
                        className="w-12 text-center text-sm font-medium border border-gray-200 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => changeQty(i, 1)}
                        className="w-6 h-6 flex items-center justify-center border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-right">
                      {item.discount > 0 && (
                        <p className="text-xs text-green-600">-฿{item.discount.toFixed(2)}</p>
                      )}
                      <p className="text-sm font-semibold text-gray-900">
                        ฿{item.subtotal.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary + Checkout */}
        <div className="border-t border-gray-100 p-3 space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>ราคาก่อนลด</span>
            <span>฿{subtotal.toFixed(2)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>ส่วนลดรวม</span>
              <span>-฿{totalDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg text-gray-900">
            <span>รวม</span>
            <span>฿{total.toFixed(2)}</span>
          </div>

          <button
            disabled={cart.length === 0}
            onClick={() => setShowPayment(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-base transition-colors"
          >
            ชำระเงิน
          </button>

          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="w-full text-sm text-gray-400 hover:text-red-500 py-1 transition-colors"
            >
              ล้างตะกร้า
            </button>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          cart={cart}
          subtotal={subtotal}
          totalDiscount={totalDiscount}
          total={total}
          customer={customer}
          pointsConfig={pointsConfig}
          cashierId={cashierId}
          promptpayId={promptpayId}
          visitId={activeVisit?.id ?? null}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setCart([])
            setCustomer(null)
            setCustomerPhone('')
            setShowAddCustomer(false)
            setShowPayment(false)
            setActiveVisit(null)
            toast.success('บันทึกการขายแล้ว')
            // คิวคลินิกอยู่ฝั่ง server — ต้อง refresh ไม่งั้นรายการที่เพิ่งเก็บเงินยังค้างอยู่
            router.refresh()
          }}
        />
      )}

      {/* คิวเก็บเงินจากคลินิก */}
      {showQueue && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowQueue(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Stethoscope size={18} className="text-gray-400" /> รอเก็บเงินจากคลินิก
              </h2>
              <button onClick={() => setShowQueue(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
              {clinicQueue.map((v) => {
                const visitTotal = v.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
                return (
                  <button
                    key={v.id}
                    onClick={() => loadVisit(v)}
                    className="w-full text-left px-2 py-3 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {v.pet_name || 'ไม่ระบุสัตว์'}
                          <span className="ml-2 text-xs text-gray-400">{v.customer?.name ?? 'ไม่มีเจ้าของในระบบ'}</span>
                        </p>
                        <p className="text-xs text-gray-400 font-mono">{v.visit_number} · {v.items.length} รายการ</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 shrink-0">
                        ฿{visitTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </button>
                )
              })}
              {clinicQueue.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-400">ไม่มีรายการรอเก็บเงิน</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
