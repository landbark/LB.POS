'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Receipt, ShoppingBag, Printer, Ban, Wallet, PackageMinus, RotateCcw } from 'lucide-react'
import CancelReceiptModal from './CancelReceiptModal'
import ReturnModal from '@/components/ReturnModal'
import EditPaymentModal from './EditPaymentModal'
import DocumentDetailModal, { type DetailTarget, type StockDocItem } from './DocumentDetailModal'
import type { PaymentMethod, RefundMethod, SalesChannel, StockMovementType } from '@/lib/types'
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
  /** ทุกรายการในใบ — ส่งมาพร้อมหน้าเพราะใบนี้ไม่มีตารางเอกสารใน DB ให้ยิงเอาทีหลัง */
  items: StockDocItem[]
}

/** ใบคืน/เปลี่ยนสินค้า — บิลเดิมยังอยู่ครบ (ดู src/lib/returns.ts) */
interface ReturnRow {
  id: string
  return_number: string
  created_at: string
  return_value: number
  offset_amount: number
  refund_amount: number
  refund_method: RefundMethod | null
  restocked: boolean
  reason: string | null
  transactions: { transaction_number: string } | null
  exchange: { id: string; transaction_number: string; total: number } | null
  customers: { name: string } | null
  profiles: { name: string } | null
  return_items: { id: string; quantity: number; unit_name: string | null; products: { name: string; sku: string | null; unit: string } | null; amount: number }[]
}

type Tab = 'receipt' | 'purchase' | 'stock' | 'return'

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

/** ป้ายทุกใบในหน้านี้ — ห้ามตัดบรรทัด ไม่งั้นคำสองพยางค์อย่าง "ปรับลด" ม้วนเป็นก้อนกลมในคอลัมน์แคบ */
const BADGE = 'inline-flex items-center whitespace-nowrap text-xs px-2 py-0.5 rounded-full font-medium'

// ป้ายสีประจำช่องทางรับเงิน — ไล่สายตาหาบิลเงินสด/เงินโอนในร้อยแถวด้วยสี เร็วกว่าอ่านตัวหนังสือทีละบรรทัด
const PaymentTag = ({ method, amount }: { method: PaymentMethod; amount?: number }) => (
  <span className={`${BADGE} ${PAYMENT_BADGE[method]}`}>
    {PAYMENT_LABEL[method] ?? method}
    {amount != null && <span className="ml-1 tabular-nums font-normal">฿{amount.toFixed(2)}</span>}
  </span>
)

const REFUND_LABEL: Record<RefundMethod, string> = {
  cash: 'คืนเงินสด',
  transfer: 'คืนโดยโอน',
  credit: 'เก็บเป็นเครดิต',
}

/** ของที่รับคืน 2 ตัวแรกไว้อ่านในตารางโดยไม่ต้องเปิดใบ */
const returnPreview = (r: { return_items: { quantity: number; unit_name: string | null; products: { name: string; unit: string } | null }[] }) => {
  const names = r.return_items.map((i) => `${i.products?.name ?? '—'} × ${i.quantity}`)
  return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '')
}

const StatusTag = ({ cancelled }: { cancelled: boolean }) => (
  <span className={`${BADGE} ${cancelled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
    {cancelled ? 'ยกเลิกแล้ว' : 'ปกติ'}
  </span>
)

const PrintLink = ({ href, title }: { href: string; title: string }) => (
  <Link
    href={href}
    target="_blank"
    title={title}
    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg"
  >
    <Printer size={15} />
  </Link>
)

export default function DocumentsClient({
  receipts,
  purchaseOrders,
  stockDocs,
  returns,
  currentUserId,
  canEdit,
  initialTab = 'receipt',
}: {
  receipts: ReceiptRow[]
  purchaseOrders: PurchaseOrderRow[]
  stockDocs: StockDocRow[]
  returns: ReturnRow[]
  currentUserId: string
  canEdit: boolean
  /** ?tab=stock — ให้ลิงก์จากหน้ารายงานเปิดมาที่แท็บใบตัดสต็อกได้ตรง ๆ */
  initialTab?: Tab
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  const [cancelling, setCancelling] = useState<ReceiptRow | null>(null)
  const [returning, setReturning] = useState<ReceiptRow | null>(null)
  const [editingPayment, setEditingPayment] = useState<ReceiptRow | null>(null)
  const [detail, setDetail] = useState<DetailTarget | null>(null)

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
  const filteredReturns = q
    ? returns.filter(
        (r) =>
          r.return_number.toLowerCase().includes(q) ||
          (r.transactions?.transaction_number ?? '').toLowerCase().includes(q) ||
          (r.customers?.name ?? '').toLowerCase().includes(q) ||
          (r.profiles?.name ?? '').toLowerCase().includes(q) ||
          r.return_items.some((i) => (i.products?.name ?? '').toLowerCase().includes(q))
      )
    : returns

  const tabClass = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  const openReceipt = (r: ReceiptRow) =>
    setDetail({ kind: 'receipt', id: r.id, title: `ใบเสร็จ ${r.transaction_number}` })
  const openPurchase = (p: PurchaseOrderRow) =>
    setDetail({ kind: 'purchase', id: p.id, title: `ใบสั่งซื้อ ${p.purchase_number}` })
  const openStock = (d: StockDocRow) =>
    setDetail({
      kind: 'stock',
      id: d.id,
      title: `${MOVEMENT_LABEL[d.type].text} · ${fmtDate(d.createdAt)}`,
      stock: {
        type: d.type,
        note: d.note,
        createdAt: d.createdAt,
        byName: d.byName,
        totalQty: d.totalQty,
        items: d.items,
      },
    })

  /** แถวเดียวกันวาดสองชุด (การ์ดจอเล็ก / ตารางจอใหญ่) — ป้ายวิธีรับเงินเลยแยกมาไว้ที่เดียว */
  const paymentCell = (r: ReceiptRow) => (
    <>
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
    </>
  )

  const receiptActions = (r: ReceiptRow) => (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      <PrintLink href={`/print/receipt/${r.id}`} title="พิมพ์ใบเสร็จ" />
      {/* บิลแพลตฟอร์มไม่มีวิธีรับเงินให้แก้ — เงินเข้าทางแพลตฟอร์ม ไม่ได้รับที่ร้าน */}
      {canEdit && r.status !== 'cancelled' && !isPlatformChannel(r.sales_channel) && (
        <button
          onClick={() => setEditingPayment(r)}
          title="แก้วิธีรับเงิน"
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg"
        >
          <Wallet size={15} />
        </button>
      )}
      {/* รับคืนบางรายการ — ไม่แตะบิลเดิม ยอดขายของวันที่ขายไม่ขยับ (ต่างจากยกเลิกทั้งใบ) */}
      {canEdit && r.status !== 'cancelled' && !isPlatformChannel(r.sales_channel) && (
        <button
          onClick={() => setReturning(r)}
          title="รับคืน / เปลี่ยนสินค้า"
          className="p-2 text-gray-400 hover:text-teal-600 hover:bg-gray-100 rounded-lg"
        >
          <RotateCcw size={15} />
        </button>
      )}
      {canEdit && r.status !== 'cancelled' && (
        <button
          onClick={() => setCancelling(r)}
          title="ยกเลิกใบเสร็จ"
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg"
        >
          <Ban size={15} />
        </button>
      )}
    </div>
  )

  const backdateNote = (r: ReceiptRow) =>
    r.recorded_at ? (
      <span
        className="block text-[11px] font-medium text-amber-700"
        title={`คีย์เข้าระบบ ${fmtDate(r.recorded_at)}${r.backdate_reason ? ` · ${r.backdate_reason}` : ''}`}
      >
        ↩ ย้อนหลัง{r.backdate_reason ? ` · ${r.backdate_reason}` : ''}
      </span>
    ) : null

  const emptyText =
    tab === 'receipt'
      ? 'ไม่พบใบเสร็จ'
      : tab === 'purchase'
        ? 'ไม่พบใบสั่งซื้อ'
        : tab === 'return'
          ? 'ไม่พบใบคืน/เปลี่ยนสินค้า'
          : 'ไม่พบใบตัดสต็อก/ปรับสต็อก'
  const emptyOnThisTab =
    tab === 'receipt'
      ? filteredReceipts.length === 0
      : tab === 'purchase'
        ? filteredPurchases.length === 0
        : tab === 'return'
          ? filteredReturns.length === 0
          : filteredStockDocs.length === 0

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">เอกสาร</h1>
      <p className="text-sm text-gray-500 mb-4 sm:mb-6">
        รวมใบเสร็จ ใบสั่งซื้อ และใบตัดสต็อก · กดที่แถวเพื่อดูรายการในใบ หรือกดไอคอนเครื่องพิมพ์เพื่อพิมพ์ย้อนหลัง
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100 px-2 pb-2 sm:pb-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {/* แท็บเลื่อนแนวนอนบนมือถือ — สามแท็บพร้อมตัวเลขเรียงกันกว้างเกินจอ 375px */}
            <div className="flex overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
              <button className={tabClass(tab === 'receipt')} onClick={() => setTab('receipt')}>
                <Receipt size={15} /> ใบเสร็จ ({receipts.length})
              </button>
              <button className={tabClass(tab === 'purchase')} onClick={() => setTab('purchase')}>
                <ShoppingBag size={15} /> ใบสั่งซื้อ ({purchaseOrders.length})
              </button>
              <button className={tabClass(tab === 'return')} onClick={() => setTab('return')}>
                <RotateCcw size={15} /> ใบคืน/เปลี่ยน ({returns.length})
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
                    : tab === 'return'
                      ? 'ค้นหาเลขที่ใบคืน / บิลเดิม / สินค้า...'
                      : 'ค้นหาเหตุผล / สินค้า / คนทำ...'
              }
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-56 mt-2 sm:my-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* จอเล็กใช้การ์ด — ตารางเจ็ด-แปดคอลัมน์บีบจนป้ายกับชื่อสินค้าแตกเป็นคำละบรรทัด */}
        <div className="md:hidden divide-y divide-gray-100">
          {tab === 'receipt' &&
            filteredReceipts.map((r) => (
              <div key={r.id} className="px-4 py-3 active:bg-gray-50" onClick={() => openReceipt(r)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-gray-700">{r.transaction_number}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {fmtDate(r.created_at)} · {r.profiles?.name ?? '—'}
                    </p>
                    {backdateNote(r)}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-gray-900">฿{money(r.total)}</p>
                    {r.status === 'cancelled' && (
                      <span className="mt-1 inline-block">
                        <StatusTag cancelled />
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                  <span className={`${BADGE} ${CHANNEL_BADGE[r.sales_channel]}`}>
                    {CHANNEL_LABEL[r.sales_channel] ?? r.sales_channel}
                  </span>
                  {paymentCell(r)}
                  {channelGroup(r.sales_channel) === 'online' && r.external_order_no && (
                    <span className="font-mono text-[11px] text-gray-400">{r.external_order_no}</span>
                  )}
                </div>
                <div className="mt-1">{receiptActions(r)}</div>
              </div>
            ))}

          {tab === 'purchase' &&
            filteredPurchases.map((p) => (
              <div key={p.id} className="px-4 py-3 active:bg-gray-50" onClick={() => openPurchase(p)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-gray-700">{p.purchase_number}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{fmtDate(p.created_at)}</p>
                    <p className="mt-0.5 truncate text-sm text-gray-700">{p.suppliers?.name ?? '—'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-gray-900">฿{money(p.total_cost)}</p>
                    <span className="mt-1 inline-block">
                      <span className={`${BADGE} ${p.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {p.status === 'received' ? 'รับแล้ว' : 'รอรับสินค้า'}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="mt-1 flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <PrintLink href={`/print/purchase/${p.id}`} title="พิมพ์ใบสั่งซื้อ" />
                </div>
              </div>
            ))}

          {tab === 'stock' &&
            filteredStockDocs.map((d) => {
              const cfg = MOVEMENT_LABEL[d.type]
              return (
                <div key={d.id} className="px-4 py-3 active:bg-gray-50" onClick={() => openStock(d)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`${BADGE} ${cfg.className}`}>{cfg.text}</span>
                      <p className="mt-1 text-sm text-gray-700">
                        {d.preview}
                        {d.itemCount > 1 && <span className="text-xs text-gray-400"> · {d.itemCount} รายการ</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {fmtDate(d.createdAt)} · {d.byName}
                      </p>
                      {d.note && <p className="mt-0.5 text-xs text-gray-500">{d.note}</p>}
                    </div>
                    <p className={`shrink-0 text-sm font-semibold ${cfg.sign === '+' ? 'text-green-600' : 'text-red-500'}`}>
                      {cfg.sign}
                      {d.totalQty.toLocaleString('th-TH')}
                    </p>
                  </div>
                  <div className="mt-1 flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <PrintLink href={`/print/stock-adjust/${d.id}`} title="พิมพ์ใบตัดสต็อก" />
                  </div>
                </div>
              )
            })}

          {tab === 'return' &&
            filteredReturns.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-gray-700">{r.return_number}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {fmtDate(r.created_at)} · {r.profiles?.name ?? '—'}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-700">{returnPreview(r)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      บิลเดิม {r.transactions?.transaction_number ?? '—'}
                      {r.exchange && ` → ${r.exchange.transaction_number}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-teal-700">−฿{money(r.return_value)}</p>
                    {r.exchange && Number(r.exchange.total) > 0 && (
                      <p className="text-xs text-green-700">เก็บเพิ่ม ฿{money(Number(r.exchange.total))}</p>
                    )}
                    {r.refund_amount > 0 && (
                      <p className="text-xs text-red-600">
                        คืน ฿{money(r.refund_amount)}
                        {r.refund_method && ` · ${REFUND_LABEL[r.refund_method]}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`${BADGE} ${r.exchange ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
                    {r.exchange ? 'เปลี่ยนสินค้า' : 'รับคืน'}
                  </span>
                  {!r.restocked && <span className={`${BADGE} bg-amber-100 text-amber-700`}>ไม่คืนสต็อก</span>}
                  {r.reason && <span className="text-xs text-gray-500">{r.reason}</span>}
                </div>
              </div>
            ))}

          {emptyOnThisTab && <p className="px-4 py-10 text-center text-sm text-gray-400">{emptyText}</p>}
        </div>

        <div className="hidden md:block overflow-x-auto">
          {tab === 'return' ? (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เลขที่</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">บิลเดิม → บิลใหม่</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ของที่รับคืน</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">โดย</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3 whitespace-nowrap">มูลค่าคืน</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3 whitespace-nowrap">เงินเพิ่ม/คืน</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">
                      {r.return_number}
                      <span className={`${BADGE} ml-2 ${r.exchange ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
                        {r.exchange ? 'เปลี่ยน' : 'คืน'}
                      </span>
                      {!r.restocked && <span className={`${BADGE} ml-1 bg-amber-100 text-amber-700`}>ไม่คืนสต็อก</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">
                      {r.transactions?.transaction_number ?? '—'}
                      {r.exchange && <span className="text-teal-700"> → {r.exchange.transaction_number}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {returnPreview(r)}
                      {r.reason && <span className="block text-xs text-gray-400">{r.reason}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{r.profiles?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-teal-700 text-right whitespace-nowrap">
                      −฿{money(r.return_value)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                      {r.exchange && Number(r.exchange.total) > 0 && (
                        <span className="block text-green-700">+฿{money(Number(r.exchange.total))}</span>
                      )}
                      {r.refund_amount > 0 && (
                        <span className="block text-red-600">
                          −฿{money(r.refund_amount)}
                          {r.refund_method && <span className="text-xs text-gray-400"> {REFUND_LABEL[r.refund_method]}</span>}
                        </span>
                      )}
                      {r.exchange && Number(r.exchange.total) === 0 && r.refund_amount === 0 && (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {r.exchange && <PrintLink href={`/print/receipt/${r.exchange.id}`} title="พิมพ์ใบเสร็จบิลใหม่" />}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredReturns.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                      ไม่พบใบคืน/เปลี่ยนสินค้า
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : tab === 'stock' ? (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 whitespace-nowrap">วันที่</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ประเภท</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">รายการ</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เหตุผล</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">โดย</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3 whitespace-nowrap">จำนวนรวม</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredStockDocs.map((d) => {
                  const cfg = MOVEMENT_LABEL[d.type]
                  return (
                    <tr key={d.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openStock(d)}>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDate(d.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`${BADGE} ${cfg.className}`}>{cfg.text}</span>
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
                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <PrintLink href={`/print/stock-adjust/${d.id}`} title="พิมพ์ใบตัดสต็อก" />
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
                  <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openReceipt(r)}>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">{r.transaction_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {/* บิลที่คีย์ตามหลัง — วันที่ข้างบนคือวันที่ขาย ไม่ใช่วันที่บันทึก */}
                      {fmtDate(r.created_at)}
                      {backdateNote(r)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.profiles?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`${BADGE} ${CHANNEL_BADGE[r.sales_channel]}`}>
                        {CHANNEL_LABEL[r.sales_channel] ?? r.sales_channel}
                      </span>
                      {channelGroup(r.sales_channel) === 'online' && r.external_order_no && (
                        <span className="block mt-0.5 text-[11px] font-mono text-gray-400">{r.external_order_no}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{paymentCell(r)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusTag cancelled={r.status === 'cancelled'} />
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">฿{money(r.total)}</td>
                    <td className="px-4 py-3">{receiptActions(r)}</td>
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
                  <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openPurchase(p)}>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">{p.purchase_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{p.suppliers?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`${BADGE} ${p.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {p.status === 'received' ? 'รับแล้ว' : 'รอรับสินค้า'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">฿{money(p.total_cost)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <PrintLink href={`/print/purchase/${p.id}`} title="พิมพ์ใบสั่งซื้อ" />
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

      {tab === 'stock' && (
        <p className="text-xs text-gray-400 mt-3">
          ของที่ตัดออกตอนขายอยู่ในใบเสร็จของบิลนั้นแล้ว · ใบนี้เก็บเฉพาะที่ปรับ/ตัดออกนอกบิล เช่น ของเสีย
          ใช้ในร้าน แถมลูกค้า · ส่วนที่มาจากการนับสต็อกดูได้ที่เมนู &quot;นับสต็อก&quot; ·
          ภาพรวมของเข้า-ออกทั้งหมดดูที่ <Link href="/admin/reports/stock" className="text-blue-600 hover:text-blue-700">รายงานความเคลื่อนไหวสต็อค</Link>
        </p>
      )}

      {detail && <DocumentDetailModal target={detail} onClose={() => setDetail(null)} />}

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

      {returning && (
        <ReturnModal
          currentUserId={currentUserId}
          initialBillId={returning.id}
          onClose={() => setReturning(null)}
          onDone={() => router.refresh()}
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
