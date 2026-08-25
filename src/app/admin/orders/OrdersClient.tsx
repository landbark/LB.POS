'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/ProgressLink'
import { CheckCircle2, ImageIcon, PackageCheck, Search, Truck } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/lib/confirm'
import { confirmOrder } from '@/lib/confirmOrder'
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLE } from '@/lib/shop'
import { FULFILLMENT_LABELS, type Order, type OrderStatus } from '@/lib/types'

const money = (n: number) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTh = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

// จัดกลุ่มให้พนักงานเห็นว่าอะไรต้องทำก่อน
const TABS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: 'todo', label: 'ต้องจัดการ', statuses: ['awaiting_confirm', 'confirmed'] },
  { key: 'waiting', label: 'รอลูกค้าโอน', statuses: ['pending_payment'] },
  { key: 'sent', label: 'ส่งแล้ว/รอรับ', statuses: ['shipped', 'ready_pickup'] },
  { key: 'done', label: 'จบแล้ว', statuses: ['completed', 'cancelled'] },
  { key: 'all', label: 'ทั้งหมด', statuses: [] },
]

const NEEDS_CONFIRM: OrderStatus[] = ['pending_payment', 'awaiting_confirm']
const NEEDS_SEND: OrderStatus[] = ['confirmed']
const NEEDS_CLOSE: OrderStatus[] = ['shipped', 'ready_pickup']

interface Props {
  orders: Order[]
  slipUrls: Record<string, string>
  userId: string
}

export default function OrdersClient({ orders, slipUrls, userId }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState('todo')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    TABS.forEach((t) => {
      map[t.key] = t.statuses.length === 0 ? orders.length : orders.filter((o) => t.statuses.includes(o.status)).length
    })
    return map
  }, [orders])

  const filtered = useMemo(() => {
    const statuses = TABS.find((t) => t.key === tab)?.statuses ?? []
    const q = query.trim().toLowerCase()
    return orders.filter((order) => {
      if (statuses.length > 0 && !statuses.includes(order.status)) return false
      if (!q) return true
      return (
        order.order_number.toLowerCase().includes(q) ||
        (order.customers?.name ?? '').toLowerCase().includes(q) ||
        (order.phone ?? '').includes(q) ||
        (order.customers?.phone ?? '').includes(q)
      )
    })
  }, [orders, tab, query])

  const picked = filtered.filter((o) => selected.has(o.id))
  const toConfirm = picked.filter((o) => NEEDS_CONFIRM.includes(o.status))
  const toSend = picked.filter((o) => NEEDS_SEND.includes(o.status))
  const toClose = picked.filter((o) => NEEDS_CLOSE.includes(o.status))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((o) => o.id))))
  }

  async function runConfirm(list: Order[]) {
    const withoutSlip = list.filter((o) => !o.payment_slip_path).length
    const { confirmed } = await confirmDialog({
      title: list.length === 1 ? 'ยืนยันออเดอร์นี้?' : `ยืนยัน ${list.length} ออเดอร์?`,
      message: `ระบบจะตัดสต็อคและสร้างบิลขายให้ทันที${withoutSlip > 0 ? `\n(มี ${withoutSlip} ออเดอร์ที่ยังไม่มีสลิปโอนเงิน)` : ''}`,
      confirmLabel: 'ยืนยัน',
      tone: 'primary',
    })
    if (!confirmed) return

    setBusy(true)
    const failed: string[] = []
    for (const order of list) {
      const { error } = await confirmOrder(order, userId)
      if (error) failed.push(`${order.order_number}: ${error}`)
    }
    setBusy(false)
    setSelected(new Set())

    const ok = list.length - failed.length
    if (ok > 0) toast.success(`ยืนยันแล้ว ${ok} ออเดอร์ — ตัดสต็อคและลงยอดขายเรียบร้อย`)
    if (failed.length > 0) toast.error(failed.join('\n'), { duration: 8000 })
    router.refresh()
  }

  async function runSend(list: Order[]) {
    // ส่งทีละใบถามเลขพัสดุได้ ส่งหลายใบพร้อมกันข้ามไปก่อน (เลขคนละใบ)
    let tracking = ''
    const single = list.length === 1 && list[0].fulfillment === 'delivery'
    const { confirmed, value } = await confirmDialog({
      title: single ? 'บันทึกว่าจัดส่งแล้ว?' : `อัปเดต ${list.length} ออเดอร์เป็นจัดส่งแล้ว?`,
      message: single
        ? 'ลูกค้าจะเห็นสถานะว่าจัดส่งแล้ว พร้อมเลขพัสดุถ้าใส่ไว้'
        : 'ออเดอร์ที่ให้มารับที่ร้านจะเปลี่ยนเป็น "พร้อมให้มารับ" ให้อัตโนมัติ',
      confirmLabel: 'บันทึก',
      tone: 'primary',
      ...(single ? { reasonLabel: 'เลขพัสดุ', reasonPlaceholder: 'เช่น TH01234567890' } : {}),
    })
    if (!confirmed) return
    tracking = value

    setBusy(true)
    const supabase = createClient()
    const now = new Date().toISOString()
    for (const order of list) {
      await supabase
        .from('orders')
        .update(
          order.fulfillment === 'pickup'
            ? { status: 'ready_pickup' }
            : { status: 'shipped', shipped_at: now, tracking_number: tracking || order.tracking_number }
        )
        .eq('id', order.id)
    }
    setBusy(false)
    setSelected(new Set())
    toast.success(`อัปเดต ${list.length} ออเดอร์แล้ว`)
    router.refresh()
  }

  async function runClose(list: Order[]) {
    const { confirmed } = await confirmDialog({
      title: list.length === 1 ? 'ปิดออเดอร์นี้?' : `ปิด ${list.length} ออเดอร์?`,
      message: 'ใช้เมื่อลูกค้าได้รับของแล้ว',
      confirmLabel: 'ปิดออเดอร์',
      tone: 'primary',
    })
    if (!confirmed) return

    setBusy(true)
    const supabase = createClient()
    const now = new Date().toISOString()
    for (const order of list) {
      await supabase.from('orders').update({ status: 'completed', completed_at: now }).eq('id', order.id)
    }
    setBusy(false)
    setSelected(new Set())
    toast.success(`ปิดออเดอร์แล้ว ${list.length} รายการ`)
    router.refresh()
  }

  const actionButton = 'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap disabled:opacity-50'

  function rowAction(order: Order) {
    if (NEEDS_CONFIRM.includes(order.status)) {
      return (
        <button onClick={() => runConfirm([order])} disabled={busy} className={`${actionButton} bg-green-600 hover:bg-green-700 text-white`}>
          ยืนยัน → รอจัด
        </button>
      )
    }
    if (NEEDS_SEND.includes(order.status)) {
      return (
        <button onClick={() => runSend([order])} disabled={busy} className={`${actionButton} bg-blue-600 hover:bg-blue-700 text-white`}>
          {order.fulfillment === 'pickup' ? 'พร้อมให้มารับ' : 'จัดส่งแล้ว'}
        </button>
      )
    }
    if (NEEDS_CLOSE.includes(order.status)) {
      return (
        <button onClick={() => runClose([order])} disabled={busy} className={`${actionButton} bg-gray-700 hover:bg-gray-800 text-white`}>
          จบรายการ
        </button>
      )
    }
    return null
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ออเดอร์ออนไลน์</h1>
        <p className="text-sm text-gray-500 mt-0.5">ตรวจสลิป → ยืนยัน (ตัดสต็อค+ลงยอดขาย) → ส่งของ — กดเปลี่ยนสถานะได้จากตารางนี้เลย</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelected(new Set()) }}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-blue-100' : 'text-gray-400'}`}>{counts[t.key]}</span>
          </button>
        ))}

        <div className="relative ml-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเลขที่ / ชื่อ / เบอร์"
            className="pl-9 pr-3 py-2 w-64 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* แถบจัดการหลายออเดอร์พร้อมกัน */}
      {picked.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-900">เลือกไว้ {picked.length} ออเดอร์</span>
          {toConfirm.length > 0 && (
            <button onClick={() => runConfirm(toConfirm)} disabled={busy} className={`${actionButton} bg-green-600 hover:bg-green-700 text-white`}>
              <CheckCircle2 size={13} className="inline mr-1" />ยืนยัน {toConfirm.length} ออเดอร์
            </button>
          )}
          {toSend.length > 0 && (
            <button onClick={() => runSend(toSend)} disabled={busy} className={`${actionButton} bg-blue-600 hover:bg-blue-700 text-white`}>
              <Truck size={13} className="inline mr-1" />จัดส่งแล้ว {toSend.length} ออเดอร์
            </button>
          )}
          {toClose.length > 0 && (
            <button onClick={() => runClose(toClose)} disabled={busy} className={`${actionButton} bg-gray-700 hover:bg-gray-800 text-white`}>
              จบรายการ {toClose.length} ออเดอร์
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-blue-700 hover:underline">
            ล้างที่เลือก
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <PackageCheck size={32} className="mx-auto mb-2" />
            <p className="text-sm">ไม่มีออเดอร์ในกลุ่มนี้</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-blue-600"
                    aria-label="เลือกทั้งหมด"
                  />
                </th>
                <th className="text-left font-medium px-4 py-3">เลขที่</th>
                <th className="text-left font-medium px-4 py-3">ลูกค้า</th>
                <th className="text-left font-medium px-4 py-3">รายการ</th>
                <th className="text-left font-medium px-4 py-3">รับของ</th>
                <th className="text-right font-medium px-4 py-3">ยอดรวม</th>
                <th className="text-center font-medium px-4 py-3">สลิป</th>
                <th className="text-left font-medium px-4 py-3">สถานะ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((order) => (
                <tr key={order.id} className={selected.has(order.id) ? 'bg-blue-50/50' : 'hover:bg-gray-50'}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      onChange={() => toggle(order.id)}
                      className="w-4 h-4 accent-blue-600"
                      aria-label={`เลือก ${order.order_number}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${order.id}`} className="font-medium text-blue-600 hover:underline">
                      {order.order_number}
                    </Link>
                    <p className="text-xs text-gray-400">{dateTh(order.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900">{order.customers?.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{order.phone ?? order.customers?.phone ?? ''}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                    {(order.order_items ?? []).map((i) => `${i.product_name} × ${i.quantity}`).join(', ')}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{FULFILLMENT_LABELS[order.fulfillment]}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">฿{money(order.total)}</td>
                  <td className="px-4 py-3 text-center">
                    {slipUrls[order.id] ? (
                      <a
                        href={slipUrls[order.id]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <ImageIcon size={14} /> ดูสลิป
                      </a>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${ORDER_STATUS_STYLE[order.status]}`}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{rowAction(order)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
