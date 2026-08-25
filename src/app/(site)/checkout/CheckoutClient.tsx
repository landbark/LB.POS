'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin, Store } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCart } from '@/lib/use-cart'
import { formatWeightApprox } from '@/lib/shop'
import { PROVINCES } from '@/lib/provinces'
import type { CustomerAddress, Fulfillment } from '@/lib/types'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  customerName: string
  customerPhone: string
  addresses: CustomerAddress[]
  pickupNote: string | null
  storeAddress: string | null
  freeShippingMin: number | null
}

interface Quote {
  subtotal: number
  weightGrams: number
  shippingFee: number | null
  total: number | null
  zoneName?: string
  freeShipping?: boolean
  shippingError?: string
}

const inputClass =
  'w-full rounded-lg border border-brand-muted/40 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-brown/40'

export default function CheckoutClient({
  customerName,
  customerPhone,
  addresses,
  pickupNote,
  storeAddress,
  freeShippingMin,
}: Props) {
  const router = useRouter()
  const cart = useCart()

  const [fulfillment, setFulfillment] = useState<Fulfillment>('delivery')
  const [addressId, setAddressId] = useState<string>(addresses[0]?.id ?? '')
  const [saveAddress, setSaveAddress] = useState(true)
  const [note, setNote] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    recipient_name: customerName,
    phone: customerPhone,
    address_line: '',
    subdistrict: '',
    district: '',
    province: '',
    postal_code: '',
  })

  const usingNewAddress = addressId === '' || addressId === 'new'
  const selectedAddress = addresses.find((a) => a.id === addressId)
  const province = usingNewAddress ? form.province : (selectedAddress?.province ?? '')

  const items = useMemo(
    () => cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    [cart.items]
  )
  const itemsKey = JSON.stringify(items)

  useEffect(() => {
    if (items.length === 0) return
    let cancelled = false

    // ห่อใน async function — เลี่ยง setState ตรงๆ ใน effect body (react-hooks/set-state-in-effect)
    async function run() {
      setQuoting(true)
      try {
        const res = await fetch('/api/shop/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, fulfillment, province }),
        })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setQuote(null)
          toast.error(data.error ?? 'คิดยอดไม่สำเร็จ')
          return
        }
        setQuote(data)
      } catch {
        // ปล่อยให้ยอดเดิมค้างไว้ ผู้ใช้กดใหม่ได้
      } finally {
        if (!cancelled) setQuoting(false)
      }
    }
    run()

    return () => { cancelled = true }
    // itemsKey แทน items เพื่อไม่ให้ยิงซ้ำทุก render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, fulfillment, province])

  async function submit() {
    if (items.length === 0) return
    setSubmitting(true)

    const payload: Record<string, unknown> = { items, fulfillment, note }
    if (fulfillment === 'delivery') {
      if (usingNewAddress) {
        payload.address = form
        payload.saveAddress = saveAddress
      } else {
        payload.addressId = addressId
      }
    }

    const res = await fetch('/api/shop/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      toast.error(data.error ?? 'สั่งซื้อไม่สำเร็จ')
      return
    }

    cart.clear()
    toast.success(`สั่งซื้อสำเร็จ เลขที่ ${data.order_number}`)
    router.push(`/orders/${data.id}`)
  }

  if (cart.items.length === 0) {
    return (
      <div className="max-w-lg mx-auto rounded-xl bg-white border border-brand-muted/30 p-10 text-center">
        <p className="text-gray-500">ตะกร้าว่าง</p>
        <Link href="/shop" className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-brand-brown text-white text-sm font-medium">
          เลือกซื้อสินค้า
        </Link>
      </div>
    )
  }

  const canSubmit =
    !submitting &&
    !quoting &&
    (fulfillment === 'pickup' || (quote?.shippingFee != null && (!usingNewAddress || (form.recipient_name && form.phone && form.address_line && form.province))))

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-brand-dark">ชำระเงิน</h1>

      {/* วิธีรับสินค้า */}
      <section className="rounded-xl bg-white border border-brand-muted/30 p-4">
        <h2 className="font-semibold text-brand-dark mb-3">รับสินค้าอย่างไร</h2>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'delivery' as const, label: 'จัดส่งตามที่อยู่', icon: MapPin },
            { value: 'pickup' as const, label: 'มารับที่ร้าน', icon: Store },
          ]).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFulfillment(value)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                fulfillment === value
                  ? 'border-brand-brown bg-brand-light text-brand-dark'
                  : 'border-brand-muted/40 text-gray-500'
              }`}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>

        {fulfillment === 'pickup' && (
          <p className="mt-3 text-sm text-gray-600">
            {pickupNote ?? 'ร้านจะติดต่อกลับเมื่อจัดของเสร็จ แล้วมารับได้ที่ร้าน'}
            {storeAddress && <span className="block mt-1 text-xs text-gray-400">{storeAddress}</span>}
          </p>
        )}
      </section>

      {/* ที่อยู่จัดส่ง */}
      {fulfillment === 'delivery' && (
        <section className="rounded-xl bg-white border border-brand-muted/30 p-4 space-y-3">
          <h2 className="font-semibold text-brand-dark">ที่อยู่จัดส่ง</h2>

          {addresses.length > 0 && (
            <select value={addressId} onChange={(e) => setAddressId(e.target.value)} className={inputClass}>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label ? `${a.label} — ` : ''}{a.recipient_name} · {a.address_line} {a.district ?? ''} {a.province}
                </option>
              ))}
              <option value="new">+ ใช้ที่อยู่ใหม่</option>
            </select>
          )}

          {usingNewAddress && (
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={inputClass}
                placeholder="ชื่อผู้รับ *"
                value={form.recipient_name}
                onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="เบอร์โทร *"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <textarea
                className={`${inputClass} sm:col-span-2`}
                rows={2}
                placeholder="บ้านเลขที่ / หมู่บ้าน / ถนน *"
                value={form.address_line}
                onChange={(e) => setForm({ ...form, address_line: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="ตำบล / แขวง"
                value={form.subdistrict}
                onChange={(e) => setForm({ ...form, subdistrict: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="อำเภอ / เขต"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
              />
              <select
                className={inputClass}
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
              >
                <option value="">เลือกจังหวัด *</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                className={inputClass}
                placeholder="รหัสไปรษณีย์"
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
              />
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={(e) => setSaveAddress(e.target.checked)}
                  className="w-4 h-4 accent-[#C4865A]"
                />
                บันทึกที่อยู่นี้ไว้ใช้ครั้งหน้า
              </label>
            </div>
          )}
        </section>
      )}

      {/* หมายเหตุ */}
      <section className="rounded-xl bg-white border border-brand-muted/30 p-4">
        <h2 className="font-semibold text-brand-dark mb-2">หมายเหตุถึงร้าน</h2>
        <textarea
          className={inputClass}
          rows={2}
          placeholder="เช่น ฝากไว้หน้าบ้านได้ / ขอใบเสร็จ"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </section>

      {/* สรุปยอด */}
      <section className="rounded-xl bg-white border border-brand-muted/30 p-4 space-y-2">
        <h2 className="font-semibold text-brand-dark mb-1">สรุปคำสั่งซื้อ</h2>
        {cart.items.map((item) => (
          <div key={item.productId} className="flex items-baseline gap-2 text-sm text-gray-600">
            {/* ชื่อยาวให้ตัด แต่จำนวนกับราคาห้ามหาย */}
            <span className="truncate">{item.name}</span>
            <span className="shrink-0 text-gray-400">× {item.quantity}</span>
            <span className="ml-auto shrink-0 whitespace-nowrap">฿{money(item.price * item.quantity)}</span>
          </div>
        ))}

        <div className="border-t border-brand-muted/20 pt-2 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>ยอดรวมสินค้า</span>
            <span>฿{money(quote?.subtotal ?? cart.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>น้ำหนักรวมโดยประมาณ</span>
            <span>{formatWeightApprox(quote?.weightGrams ?? cart.weightGrams)}</span>
          </div>

          {fulfillment === 'delivery' && (
            <div className="flex justify-between text-gray-600">
              <span>
                ค่าจัดส่ง
                {quote?.zoneName && <span className="text-xs text-gray-400"> ({quote.zoneName})</span>}
              </span>
              <span>
                {quoting ? (
                  <Loader2 size={14} className="animate-spin inline" />
                ) : quote?.shippingFee == null ? (
                  '—'
                ) : quote.freeShipping ? (
                  <span className="text-green-700 font-medium">ส่งฟรี</span>
                ) : (
                  `฿${money(quote.shippingFee)}`
                )}
              </span>
            </div>
          )}

          {quote?.shippingError && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              {quote.shippingError}
            </p>
          )}

          {freeShippingMin != null && freeShippingMin > 0 && !quote?.freeShipping && fulfillment === 'delivery' && (
            <p className="text-xs text-brand-brown">ซื้อครบ ฿{money(freeShippingMin)} ส่งฟรี</p>
          )}

          <div className="flex justify-between font-bold text-brand-dark text-base pt-1">
            <span>ยอดชำระ</span>
            <span>
              ฿{money(
                fulfillment === 'pickup'
                  ? (quote?.subtotal ?? cart.subtotal)
                  : (quote?.total ?? cart.subtotal)
              )}
            </span>
          </div>
        </div>
      </section>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={submit}
        className="w-full py-3.5 rounded-xl bg-brand-brown text-white font-semibold disabled:bg-gray-200 disabled:text-gray-400 hover:opacity-90"
      >
        {submitting ? 'กำลังสั่งซื้อ...' : 'ยืนยันคำสั่งซื้อ'}
      </button>
      <p className="text-center text-xs text-gray-400">
        สั่งซื้อแล้วจะมีหน้าแจ้งวิธีโอนเงินและอัปโหลดสลิป — ร้านจะตรวจสอบก่อนจัดส่ง
      </p>
    </div>
  )
}
