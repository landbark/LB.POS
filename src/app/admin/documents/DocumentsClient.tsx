'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Receipt, ShoppingBag, Printer, Ban, Wallet, PackageMinus } from 'lucide-react'
import CancelReceiptModal from './CancelReceiptModal'
import EditPaymentModal from './EditPaymentModal'
import type { PaymentMethod, SalesChannel, StockMovementType } from '@/lib/types'
import { MOVEMENT_LABEL } from '@/lib/stockMovements'
import { CHANNEL_LABEL, CHANNEL_BADGE, channelGroup, isPlatformChannel, platformPaymentLabel } from '@/lib/salesChannel'
import { PAYMENT_BADGE, PAYMENT_LABEL } from '@/lib/payments'

interface ReceiptRow {
  id: string
  transaction_number: string
  /** วันที่ขายจริง (บิลย้อนหลัง = วันที่เน็ตล่ม ไม่ใช่วันที่คีย์) */
  created_at: string
  /** เวลาที่คีย์เข้าระบบ · null = คีย์ตอนขาย (ดู lib/backdate) */
  recorded_at: string | null
  backdate_reason: string | null
  total: number
  status: 'completed' | 'cancelled'
  customer_id: string | null
  payment_method: PaymentMethod
  payment_method_original: PaymentMethod | null
  transaction_payments?: { method: PaymentMethod; amount: number }[] | null
  sales_channel: SalesChannel
  external_order_no: string | null
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

/**
 * ใบตัดสต็อก/ปรับสต็อก — ไม่มีตารางเอกสารของตัวเองใน DB การตัดสต็อกจากหน้าขายลงเป็นแถวใน
 * stock_movements หลายแถว ฝั่ง server จับกลุ่มให้เป็น "ใบ" แล้ว (ดู lib/stockMovements)
 */
interface StockDocRow {
  id: string
  type: StockMovementType
  note: string
  createdAt: string
  byName: string
  totalQty: number
  itemCount: number
  /** ชื่อสินค้า 2-3 ตัวแรกไว้อ่านในตารางโดยไม่ต้องเปิดใบ */
  preview: string
}

type Tab = 'receipt' | 'purchase' | 'stock'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

// ป้ายสีประจำช่องทางรับเงิน — ไล่สายตาหาบิลเงินสด/เงินโอนในร้อยแถวด้วยสี เร็วกว่าอ่านตัวหนังสือทีละบรรทัด
const PaymentTag = ({ method, amount }: { method: PaymentMethod; amount?: number }) => (
  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${PAYMENT_BADGE[method]}`}>
    {PAYMENT_LABEL[method] ?? method}
    {amount != null && <span className="ml-1 tabular-nums font-normal">฿{amount.toFixed(2)}</span>}
  </span>
)

export default function DocumentsClient({
  receipts,
  purchaseOrders,
  stockDocs,
  currentUserId,
  canEdit,
  initialTab = 'receipt',
}: {
  receipts: ReceiptRow[]
  purchaseOrders: PurchaseOrderRow[]
  stockDocs: StockDocRow[]
  currentUserId: string
  canEdit: boolean
  /** ?tab=stock — ให้ลิงก์จากหน้ารายงานเปิดมาที่แท็บใบตัดสต็อกได้ตรง ๆ */
  initialTab?: Tab
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  const [cancelling, setCancelling] = useState<ReceiptRow | null>(null)
  const [editingPayment, setEditingPayment] = useState<ReceiptRow | null>(null)

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
  const filteredStockDocs = q
    ? stockDocs.filter(
        (d) =>
          d.note.toLowerCase().includes(q) ||
          d.byName.toLowerCase().includes(q) ||
          d.preview.toLowerCase().includes(q)
      )
    : stockDocs

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">เอกสาร</h1>
      <p className="text-sm text-gray-500 mb-6">รวมใบเสร็จ ใบสั่งซื้อ และใบตัดสต็อก พร้อมพิมพ์ย้อนหลังได้</p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <div className="flex items-center justify-between border-b border-gray-100 px-2">
          <div className="flex">
            <button className={tabClass(tab === 'receipt')} onClick={() => setTab('receipt')}>
              <Receipt size={15} /> ใบเสร็จ ({receipts.length})
            </button>
            <button className={tabClass(tab === 'purchase')} onClick={() => setTab('purchase')}>
              <ShoppingBag size={15} /> ใบสั่งซื้อ ({purchaseOrders.length})
            </button>
            <button className={tabClass(tab === 'stock')} onClick={() => setTab('stock')}>
              <PackageMinus size={15} /> ใบตัดสต็อก ({stockDocs.length})
            </button>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === 'receipt'
                ? 'ค้นหาเลขที่ / แคชเชียร์...'
                : tab === 'purchase'
                  ? 'ค้นหาเลขที่ / ซัพพลายเออร์...'
                  : 'ค้นหาเหตุผล / สินค้า / คนทำ...'
            }
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm my-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
        </div>

        {tab === 'stock' ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ประเภท</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">รายการ</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เหตุผล</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">โดย</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">จำนวนรวม</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredStockDocs.map((d) => {
                const cfg = MOVEMENT_LABEL[d.type]
                return (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDate(d.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
                        {cfg.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {d.preview}
                      {d.itemCount > 1 && <span className="text-xs text-gray-400"> · {d.itemCount} รายการ</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{d.note}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{d.byName}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap ${cfg.sign === '+' ? 'text-green-600' : 'text-red-500'}`}>
                      {cfg.sign}{d.totalQty.toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Link
                          href={`/print/stock-adjust/${d.id}`}
                          target="_blank"
                          title="พิมพ์ใบตัดสต็อก"
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        >
                          <Printer size={15} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredStockDocs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    ไม่พบใบตัดสต็อก/ปรับสต็อก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : tab === 'receipt' ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เลขที่</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">แคชเชียร์</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ช่องทาง</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">รับเงิน</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ยอด</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredReceipts.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">{r.transaction_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {fmtDate(r.created_at)}
                    {/* บิลที่คีย์ตามหลัง — วันที่ข้างบนคือวันที่ขาย ไม่ใช่วันที่บันทึก */}
                    {r.recorded_at && (
                      <span
                        className="mt-0.5 block text-[11px] font-medium text-amber-700"
                        title={`คีย์เข้าระบบ ${fmtDate(r.recorded_at)}${r.backdate_reason ? ` · ${r.backdate_reason}` : ''}`}
                      >
                        ↩ ย้อนหลัง{r.backdate_reason ? ` · ${r.backdate_reason}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.profiles?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_BADGE[r.sales_channel]}`}>
                      {CHANNEL_LABEL[r.sales_channel] ?? r.sales_channel}
                    </span>
                    {channelGroup(r.sales_channel) === 'online' && r.external_order_no && (
                      <span className="block mt-0.5 text-[11px] font-mono text-gray-400">{r.external_order_no}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {/* ขายผ่านแพลตฟอร์มเก็บเป็น 'transfer' ไว้ในคอลัมน์เดิม แต่เงินไม่ได้โอนเข้าบัญชีร้านตรงๆ */}
                    {platformPaymentLabel(r.sales_channel) ? (
                      <span className="text-gray-500">{platformPaymentLabel(r.sales_channel)}</span>
                    ) : (r.transaction_payments?.length ?? 0) > 1 ? (
                      <span className="flex flex-wrap gap-1">
                        {r.transaction_payments!.map((l, i) => (
                          <PaymentTag key={i} method={l.method} amount={Number(l.amount)} />
                        ))}
                      </span>
                    ) : (
                      <PaymentTag method={r.payment_method} />
                    )}
                    {r.payment_method_original && (
                      <span
                        className="ml-1 text-xs text-amber-600"
                        title={`แก้จาก${PAYMENT_LABEL[r.payment_method_original] ?? r.payment_method_original}`}
                      >
                        (แก้แล้ว)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {r.status === 'cancelled' ? 'ยกเลิกแล้ว' : 'ปกติ'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">฿{money(r.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end items-center gap-1">
                      <Link
                        href={`/print/receipt/${r.id}`}
                        target="_blank"
                        title="พิมพ์ใบเสร็จ"
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                      >
                        <Printer size={15} />
                      </Link>
                      {/* บิลแพลตฟอร์มไม่มีวิธีรับเงินให้แก้ — เงินเข้าทางแพลตฟอร์ม ไม่ได้รับที่ร้าน */}
                      {canEdit && r.status !== 'cancelled' && !isPlatformChannel(r.sales_channel) && (
                        <button
                          onClick={() => setEditingPayment(r)}
                          title="แก้วิธีรับเงิน"
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        >
                          <Wallet size={15} />
                        </button>
                      )}
                      {canEdit && r.status !== 'cancelled' && (
                        <button
                          onClick={() => setCancelling(r)}
                          title="ยกเลิกใบเสร็จ"
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                        >
                          <Ban size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredReceipts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">ไม่พบใบเสร็จ</td>
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

      {tab === 'stock' && (
        <p className="text-xs text-gray-400 mt-3">
          ของที่ตัดออกตอนขายอยู่ในใบเสร็จของบิลนั้นแล้ว · ใบนี้เก็บเฉพาะที่ปรับ/ตัดออกนอกบิล เช่น ของเสีย
          ใช้ในร้าน แถมลูกค้า · ส่วนที่มาจากการนับสต็อกดูได้ที่เมนู &quot;นับสต็อก&quot; ·
          ภาพรวมของเข้า-ออกทั้งหมดดูที่ <Link href="/admin/reports/stock" className="text-blue-600 hover:text-blue-700">รายงานความเคลื่อนไหวสต็อค</Link>
        </p>
      )}

      {editingPayment && (
        <EditPaymentModal
          transactionId={editingPayment.id}
          transactionNumber={editingPayment.transaction_number}
          total={editingPayment.total}
          currentMethod={editingPayment.payment_method}
          currentUserId={currentUserId}
          onClose={() => setEditingPayment(null)}
          onSaved={() => {
            setEditingPayment(null)
            router.refresh()
          }}
        />
      )}

      {cancelling && (
        <CancelReceiptModal
          transactionId={cancelling.id}
          transactionNumber={cancelling.transaction_number}
          hasCustomer={!!cancelling.customer_id}
          currentUserId={currentUserId}
          onClose={() => setCancelling(null)}
          onCancelled={() => {
            setCancelling(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
