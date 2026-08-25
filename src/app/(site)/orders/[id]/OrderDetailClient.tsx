'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import generatePayload from 'promptpay-qr'
import { ArrowLeft, Loader2, Truck, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLE, formatAddress, formatWeightApprox } from '@/lib/shop'
import { FULFILLMENT_LABELS, type Order } from '@/lib/types'

const money = (n: number) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTh = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

interface Props {
  order: Order
  slipUrl: string | null
  promptpayId: string | null
  paymentQrUrl: string | null
  storeName: string
  pickupNote: string | null
}

export default function OrderDetailClient({ order, slipUrl, promptpayId, paymentQrUrl, storeName, pickupNote }: Props) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const awaitingPayment = order.status === 'pending_payment' || order.status === 'awaiting_confirm'
  const qrPayload = promptpayId ? generatePayload(promptpayId, { amount: Number(order.total) }) : null

  async function uploadSlip(file: File) {
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/shop/orders/${order.id}/slip`, { method: 'POST', body: formData })
    const data = await res.json()
    setUploading(false)

    if (!res.ok) {
      toast.error(data.error ?? 'อัปโหลดสลิปไม่สำเร็จ')
      return
    }
    toast.success('ส่งสลิปแล้ว รอร้านตรวจสอบ')
    router.refresh()
  }

  async function cancelOrder() {
    if (!confirm('ยกเลิกออเดอร์นี้?')) return
    setCancelling(true)
    const res = await fetch(`/api/shop/orders/${order.id}/cancel`, { method: 'POST' })
    const data = await res.json()
    setCancelling(false)

    if (!res.ok) {
      toast.error(data.error ?? 'ยกเลิกไม่สำเร็จ')
      return
    }
    toast.success('ยกเลิกออเดอร์แล้ว')
    router.refresh()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-brand-brown hover:underline">
        <ArrowLeft size={14} /> ออเดอร์ทั้งหมด
      </Link>

      <div className="rounded-xl bg-white border border-brand-muted/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-dark">{order.order_number}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              สั่งเมื่อ {dateTh(order.created_at)} · {FULFILLMENT_LABELS[order.fulfillment]}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${ORDER_STATUS_STYLE[order.status]}`}>
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>

        {order.status === 'shipped' && order.tracking_number && (
          <p className="mt-3 flex items-center gap-2 text-sm text-brand-dark">
            <Truck size={16} className="text-brand-brown" />
            {order.tracking_carrier ?? 'พัสดุ'} · <span className="font-mono">{order.tracking_number}</span>
          </p>
        )}
        {order.status === 'ready_pickup' && (
          <p className="mt-3 text-sm text-brand-dark">
            {pickupNote ?? 'ของพร้อมแล้ว มารับที่ร้านได้เลย'}
          </p>
        )}
        {order.status === 'cancelled' && order.cancel_reason && (
          <p className="mt-3 text-sm text-gray-500">เหตุผล: {order.cancel_reason}</p>
        )}
      </div>

      {/* รายการสินค้า */}
      <div className="rounded-xl bg-white border border-brand-muted/30 p-4 space-y-2">
        <h2 className="font-semibold text-brand-dark mb-1">รายการสินค้า</h2>
        {(order.order_items ?? []).map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-gray-600">
            <span className="pr-2">{item.product_name} × {item.quantity}</span>
            <span className="whitespace-nowrap">฿{money(item.subtotal)}</span>
          </div>
        ))}

        <div className="border-t border-brand-muted/20 pt-2 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>ยอดสินค้า</span>
            <span>฿{money(order.subtotal)}</span>
          </div>
          {order.fulfillment === 'delivery' && (
            <div className="flex justify-between text-gray-600">
              <span>ค่าจัดส่ง (ประมาณ {formatWeightApprox(order.total_weight_grams)}{order.shipping_zone_name ? ` · ${order.shipping_zone_name}` : ''})</span>
              <span>{Number(order.shipping_fee) === 0 ? 'ส่งฟรี' : `฿${money(order.shipping_fee)}`}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-brand-dark text-base pt-1">
            <span>ยอดชำระ</span>
            <span>฿{money(order.total)}</span>
          </div>
        </div>
      </div>

      {/* ที่อยู่จัดส่ง */}
      {order.fulfillment === 'delivery' && (
        <div className="rounded-xl bg-white border border-brand-muted/30 p-4">
          <h2 className="font-semibold text-brand-dark mb-1">ที่อยู่จัดส่ง</h2>
          <p className="text-sm text-gray-600">
            {order.recipient_name} · {order.phone}
          </p>
          <p className="text-sm text-gray-600">{formatAddress(order)}</p>
          {order.customer_note && (
            <p className="mt-2 text-xs text-gray-400">หมายเหตุ: {order.customer_note}</p>
          )}
        </div>
      )}

      {/* ชำระเงิน */}
      {awaitingPayment && (
        <div className="rounded-xl bg-white border border-brand-muted/30 p-4 space-y-3">
          <h2 className="font-semibold text-brand-dark">ชำระเงิน</h2>
          <p className="text-sm text-gray-600">
            โอนเงิน ฿{money(order.total)} มาที่ร้าน {storeName} แล้วแนบสลิปเพื่อให้ร้านตรวจสอบ
          </p>

          {qrPayload ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <QRCodeSVG value={qrPayload} size={200} />
              <p className="text-xs text-gray-400">สแกนด้วยแอปธนาคาร (พร้อมเพย์)</p>
            </div>
          ) : paymentQrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={paymentQrUrl} alt="QR รับชำระเงิน" className="mx-auto max-h-64 rounded-lg" />
          ) : (
            <p className="text-sm text-gray-500">ติดต่อร้านเพื่อขอเลขบัญชี</p>
          )}

          <label className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-brand-muted/50 text-sm text-brand-dark cursor-pointer hover:bg-brand-light">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {order.payment_slip_path ? 'ส่งสลิปใหม่อีกครั้ง' : 'แนบสลิปโอนเงิน'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadSlip(file)
                e.target.value = ''
              }}
            />
          </label>

          {slipUrl && (
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">สลิปที่ส่งแล้ว</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slipUrl}
                alt="สลิปโอนเงิน"
                className="mx-auto max-h-64 rounded-lg border border-brand-muted/30"
              />
            </div>
          )}

          <button
            type="button"
            onClick={cancelOrder}
            disabled={cancelling}
            className="w-full py-2.5 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            ยกเลิกออเดอร์นี้
          </button>
        </div>
      )}
    </div>
  )
}
