'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/ProgressLink'
import { ArrowLeft, Ban, CheckCircle2, ExternalLink, Printer, Truck } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/lib/confirm'
import { confirmOrder } from '@/lib/confirmOrder'
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLE, formatAddress, formatWeight } from '@/lib/shop'
import { FULFILLMENT_LABELS, type Order } from '@/lib/types'

const money = (n: number) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTh = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function OrderDetail({ order, slipUrl, userId }: { order: Order; slipUrl: string | null; userId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [carrier, setCarrier] = useState(order.tracking_carrier ?? '')
  const [tracking, setTracking] = useState(order.tracking_number ?? '')
  const [staffNote, setStaffNote] = useState(order.staff_note ?? '')

  const beforeStock = order.status === 'pending_payment' || order.status === 'awaiting_confirm'

  async function update(patch: Record<string, unknown>, successMessage: string) {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('orders').update(patch).eq('id', order.id)
    setBusy(false)
    if (error) {
      toast.error('บันทึกไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success(successMessage)
    router.refresh()
  }

  async function handleConfirm() {
    const { confirmed } = await confirmDialog({
      title: 'ยืนยันออเดอร์นี้?',
      message: order.payment_slip_path
        ? 'ระบบจะตัดสต็อคตามรายการและสร้างบิลขายให้ทันที'
        : 'ออเดอร์นี้ยังไม่มีสลิปโอนเงิน — ยืนยันแล้วระบบจะตัดสต็อคและสร้างบิลขายเลย',
      confirmLabel: 'ยืนยันออเดอร์',
      tone: 'primary',
    })
    if (!confirmed) return

    setBusy(true)
    const { error } = await confirmOrder(order, userId)
    setBusy(false)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('ยืนยันออเดอร์แล้ว — ตัดสต็อคและลงยอดขายเรียบร้อย')
    router.refresh()
  }

  async function handleCancel() {
    const { confirmed, value } = await confirmDialog({
      title: 'ยกเลิกออเดอร์นี้?',
      message: 'ลูกค้าจะเห็นสถานะว่ายกเลิก พร้อมเหตุผลที่ใส่ไว้',
      confirmLabel: 'ยกเลิกออเดอร์',
      reasonLabel: 'เหตุผลที่ยกเลิก',
      reasonPlaceholder: 'เช่น ลูกค้าไม่โอนภายในกำหนด',
    })
    if (!confirmed) return
    await update(
      {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
        cancel_reason: value || 'ร้านยกเลิก',
      },
      'ยกเลิกออเดอร์แล้ว'
    )
  }

  return (
    <div className="max-w-3xl">
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        <ArrowLeft size={14} /> ออเดอร์ทั้งหมด
      </Link>

      <div className="mt-4 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{order.order_number}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              สั่งเมื่อ {dateTh(order.created_at)} · {FULFILLMENT_LABELS[order.fulfillment]}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_STYLE[order.status]}`}>
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>

        <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-1">ลูกค้า</p>
            {order.customers ? (
              <Link href={`/admin/customers/${order.customers.id}`} className="text-blue-600 hover:underline">
                {order.customers.name} · {order.customers.phone}
              </Link>
            ) : (
              <p className="text-gray-500">—</p>
            )}
          </div>

          {order.fulfillment === 'delivery' && (
            <div>
              <p className="text-xs text-gray-400 mb-1">ที่อยู่จัดส่ง</p>
              <p className="text-gray-900">{order.recipient_name} · {order.phone}</p>
              <p className="text-gray-600">{formatAddress(order)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatWeight(order.total_weight_grams)}{order.shipping_zone_name ? ` · โซน ${order.shipping_zone_name}` : ''}
              </p>
            </div>
          )}
        </div>

        {order.customer_note && (
          <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
            หมายเหตุจากลูกค้า: {order.customer_note}
          </p>
        )}
      </div>

      {/* รายการสินค้า */}
      <div className="mt-4 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">รายการสินค้า</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {(order.order_items ?? []).map((item) => (
              <tr key={item.id}>
                <td className="py-2 text-gray-900">
                  {item.product_name}
                  {/* SKU ไว้เทียบตอนหยิบของ กันหยิบผิดรุ่น/ผิดขนาด */}
                  {item.products?.sku && (
                    <span className="ml-2 text-xs font-mono text-gray-400">{item.products.sku}</span>
                  )}
                </td>
                <td className="py-2 text-gray-500 text-right whitespace-nowrap">
                  {item.quantity} {item.unit ?? ''} × ฿{money(item.unit_price)}
                </td>
                <td className="py-2 text-right font-medium text-gray-900 whitespace-nowrap">฿{money(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>ค่าสินค้า</span>
            <span>฿{money(order.subtotal)}</span>
          </div>
          {order.fulfillment === 'delivery' && (
            <div className="flex justify-between text-gray-600">
              <span>ค่าจัดส่ง</span>
              <span>฿{money(order.shipping_fee)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 text-base">
            <span>ยอดที่ลูกค้าต้องโอน</span>
            <span>฿{money(order.total)}</span>
          </div>
        </div>

        {order.transaction_id && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <Link
              href={`/print/receipt/${order.transaction_id}`}
              className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
            >
              <Printer size={14} /> ใบเสร็จของออเดอร์นี้
            </Link>
            <span className="text-xs text-gray-400">ยอดในบิล = ค่าสินค้า ไม่รวมค่าส่ง</span>
          </div>
        )}
      </div>

      {/* สลิป */}
      <div className="mt-4 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-900 mb-1">การชำระเงิน</h2>
        <p className="text-xs text-gray-400 mb-3">
          {order.paid_reported_at ? `ลูกค้าแจ้งโอนเมื่อ ${dateTh(order.paid_reported_at)}` : 'ยังไม่ได้แจ้งโอน'}
        </p>
        {slipUrl ? (
          <a href={slipUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slipUrl} alt="สลิปโอนเงิน" className="max-h-80 rounded-lg border border-gray-200" />
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600">
              เปิดรูปเต็ม <ExternalLink size={11} />
            </span>
          </a>
        ) : (
          <p className="text-sm text-gray-400">ยังไม่มีสลิป</p>
        )}
      </div>

      {/* การจัดการ */}
      <div className="mt-4 bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">จัดการออเดอร์</h2>

        {beforeStock && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              <CheckCircle2 size={16} /> ยืนยันออเดอร์ (ตัดสต็อค + ลงยอดขาย)
            </button>
            <button
              onClick={handleCancel}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <Ban size={16} /> ยกเลิกออเดอร์
            </button>
          </div>
        )}

        {order.status === 'confirmed' && order.fulfillment === 'delivery' && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                className={inputClass}
                placeholder="ขนส่ง เช่น Kerry / ไปรษณีย์ไทย"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="เลขพัสดุ"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </div>
            <button
              onClick={() =>
                update(
                  {
                    status: 'shipped',
                    shipped_at: new Date().toISOString(),
                    tracking_carrier: carrier.trim() || null,
                    tracking_number: tracking.trim() || null,
                  },
                  'บันทึกการจัดส่งแล้ว'
                )
              }
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              <Truck size={16} /> บันทึกว่าจัดส่งแล้ว
            </button>
          </div>
        )}

        {order.status === 'confirmed' && order.fulfillment === 'pickup' && (
          <button
            onClick={() => update({ status: 'ready_pickup' }, 'แจ้งว่าของพร้อมให้มารับแล้ว')}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
          >
            <CheckCircle2 size={16} /> ของพร้อมให้มารับ
          </button>
        )}

        {(order.status === 'shipped' || order.status === 'ready_pickup') && (
          <button
            onClick={() => update({ status: 'completed', completed_at: new Date().toISOString() }, 'ปิดออเดอร์แล้ว')}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium"
          >
            <CheckCircle2 size={16} /> ลูกค้าได้รับของแล้ว
          </button>
        )}

        {!beforeStock && order.status !== 'cancelled' && (
          <p className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500">
            ออเดอร์นี้ตัดสต็อคไปแล้ว — ถ้าต้องยกเลิก/คืนของ ให้ยกเลิกใบเสร็จที่หน้า{' '}
            <Link href="/admin/documents" className="text-blue-600 hover:underline">เอกสาร</Link>{' '}
            (คืนสต็อคและแต้มให้อัตโนมัติ) แล้วค่อยกลับมาปรับสถานะออเดอร์
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">โน้ตภายในร้าน</label>
          <textarea
            className={inputClass}
            rows={2}
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
            placeholder="เช่น ลูกค้าขอให้ส่งวันจันทร์"
          />
          <button
            onClick={() => update({ staff_note: staffNote.trim() || null }, 'บันทึกโน้ตแล้ว')}
            disabled={busy}
            className="mt-2 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            บันทึกโน้ต
          </button>
        </div>
      </div>
    </div>
  )
}
