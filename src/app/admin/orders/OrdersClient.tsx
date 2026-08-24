'use client'

import { useMemo, useState } from 'react'
import Link from '@/components/ProgressLink'
import { PackageCheck, Search } from 'lucide-react'
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

export default function OrdersClient({ orders }: { orders: Order[] }) {
  const [tab, setTab] = useState('todo')
  const [query, setQuery] = useState('')

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ออเดอร์ออนไลน์</h1>
          <p className="text-sm text-gray-500 mt-0.5">ตรวจสลิป → ยืนยัน (ตัดสต็อค+ลงยอดขาย) → ส่งของ</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <PackageCheck size={32} className="mx-auto mb-2" />
            <p className="text-sm">ไม่มีออเดอร์ในกลุ่มนี้</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left font-medium px-4 py-3">เลขที่</th>
                <th className="text-left font-medium px-4 py-3">ลูกค้า</th>
                <th className="text-left font-medium px-4 py-3">รายการ</th>
                <th className="text-left font-medium px-4 py-3">รับของ</th>
                <th className="text-right font-medium px-4 py-3">ยอดรวม</th>
                <th className="text-left font-medium px-4 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
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
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_STYLE[order.status]}`}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
