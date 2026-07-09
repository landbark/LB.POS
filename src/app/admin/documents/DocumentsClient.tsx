'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Receipt, ShoppingBag, Printer } from 'lucide-react'

interface ReceiptRow {
  id: string
  transaction_number: string
  created_at: string
  total: number
  profiles: { name: string } | null
}

interface PurchaseOrderRow {
  id: string
  purchase_number: string
  created_at: string
  total_cost: number
  status: 'pending' | 'received'
  suppliers: { name: string } | null
}

type Tab = 'receipt' | 'purchase'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

export default function DocumentsClient({
  receipts,
  purchaseOrders,
}: {
  receipts: ReceiptRow[]
  purchaseOrders: PurchaseOrderRow[]
}) {
  const [tab, setTab] = useState<Tab>('receipt')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filteredReceipts = q
    ? receipts.filter(
        (r) => r.transaction_number.toLowerCase().includes(q) || (r.profiles?.name ?? '').toLowerCase().includes(q)
      )
    : receipts
  const filteredPurchases = q
    ? purchaseOrders.filter(
        (p) => p.purchase_number.toLowerCase().includes(q) || (p.suppliers?.name ?? '').toLowerCase().includes(q)
      )
    : purchaseOrders

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">เอกสาร</h1>
      <p className="text-sm text-gray-500 mb-6">รวมใบเสร็จและใบสั่งซื้อทั้งหมด พร้อมพิมพ์ย้อนหลังได้</p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-2">
          <div className="flex">
            <button className={tabClass(tab === 'receipt')} onClick={() => setTab('receipt')}>
              <Receipt size={15} /> ใบเสร็จ ({receipts.length})
            </button>
            <button className={tabClass(tab === 'purchase')} onClick={() => setTab('purchase')}>
              <ShoppingBag size={15} /> ใบสั่งซื้อ ({purchaseOrders.length})
            </button>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'receipt' ? 'ค้นหาเลขที่ / แคชเชียร์...' : 'ค้นหาเลขที่ / ซัพพลายเออร์...'}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm my-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
        </div>

        {tab === 'receipt' ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เลขที่</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">แคชเชียร์</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ยอด</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredReceipts.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">{r.transaction_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.profiles?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">฿{money(r.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Link
                        href={`/print/receipt/${r.id}`}
                        target="_blank"
                        title="พิมพ์ใบเสร็จ"
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                      >
                        <Printer size={15} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredReceipts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">ไม่พบใบเสร็จ</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เลขที่</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ซัพพลายเออร์</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ทุนรวม</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredPurchases.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">{p.purchase_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{p.suppliers?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {p.status === 'received' ? 'รับแล้ว' : 'รอรับสินค้า'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">฿{money(p.total_cost)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Link
                        href={`/print/purchase/${p.id}`}
                        target="_blank"
                        title="พิมพ์ใบสั่งซื้อ"
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                      >
                        <Printer size={15} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPurchases.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">ไม่พบใบสั่งซื้อ</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
