'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Printer, Receipt, ShoppingBag, PackageMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { PaymentMethod, SalesChannel, StockMovementType } from '@/lib/types'
import { MOVEMENT_LABEL } from '@/lib/stockMovements'
import { CHANNEL_LABEL, CHANNEL_BADGE, platformPaymentLabel } from '@/lib/salesChannel'
import { PAYMENT_LABEL } from '@/lib/payments'

/** ใบตัดสต็อกไม่มีตารางเอกสารใน DB — ฝั่ง server จับกลุ่มมาให้แล้ว เลยส่งรายการมาพร้อมแถว ไม่ต้องยิงใหม่ */
export interface StockDocItem {
  name: string
  sku: string | null
  unit: string
  quantity: number
}

export type DetailTarget =
  | { kind: 'receipt'; id: string; title: string }
  | { kind: 'purchase'; id: string; title: string }
  | { kind: 'stock'; id: string; title: string; stock: StockDocDetail }

export interface StockDocDetail {
  type: StockMovementType
  note: string
  createdAt: string
  byName: string
  totalQty: number
  items: StockDocItem[]
}

interface ReceiptItem {
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
  unit_name: string | null
  unit_factor: number
  base_quantity: number
  products: { name: string; unit: string; sku: string | null } | null
}

interface ReceiptDetail {
  transaction_number: string
  created_at: string
  recorded_at: string | null
  backdate_reason: string | null
  subtotal: number
  discount: number
  total: number
  status: 'completed' | 'cancelled'
  rounding: number | null
  payment_method: PaymentMethod
  sales_channel: SalesChannel | null
  external_order_no: string | null
  cash_received: number | null
  change_given: number | null
  points_earned: number
  points_used: number
  credit_used: number
  cancelled_at: string | null
  cancel_reason: string | null
  refund_method: string | null
  customers: { name: string; phone: string | null; hn: string | null } | null
  profiles: { name: string } | null
  transaction_items: ReceiptItem[]
  transaction_payments: { method: PaymentMethod; amount: number }[] | null
}

interface PurchaseItem {
  quantity: number
  received_quantity: number | null
  unit_cost: number
  unit_name: string | null
  unit_factor: number
  base_quantity: number
  lot_number: string | null
  expiry_date: string | null
  products: { name: string; unit: string; sku: string | null } | null
}

interface PurchaseDetail {
  purchase_number: string
  created_at: string
  received_at: string | null
  notes: string | null
  status: 'pending' | 'received'
  total_cost: number
  suppliers: { name: string; phone: string | null } | null
  purchase_items: PurchaseItem[]
}

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtDay = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

const REFUND_LABEL: Record<string, string> = { cash: 'เงินสด', transfer: 'โอนคืน', credit: 'เครดิตร้าน' }

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-4 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="text-gray-800 text-right">{value}</span>
  </div>
)

const printHref = (t: DetailTarget) =>
  t.kind === 'receipt' ? `/print/receipt/${t.id}` : t.kind === 'purchase' ? `/print/purchase/${t.id}` : `/print/stock-adjust/${t.id}`

const ICON = { receipt: Receipt, purchase: ShoppingBag, stock: PackageMinus }

export default function DocumentDetailModal({ target, onClose }: { target: DetailTarget; onClose: () => void }) {
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null)
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null)
  const [error, setError] = useState('')
  const loading = target.kind === 'receipt' ? !receipt : target.kind === 'purchase' ? !purchase : false

  // ปิดด้วย Esc — หน้านี้ดูเอกสารหลายใบติดกัน คีย์บอร์ดเร็วกว่าเลื่อนเมาส์ไปกดกากบาท
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let alive = true
    const supabase = createClient()

    async function load() {
      setError('')
      if (target.kind === 'receipt') {
        const { data, error } = await supabase
          .from('transactions')
          .select(`
            transaction_number, created_at, recorded_at, backdate_reason, subtotal, discount, total, status,
            rounding, payment_method, sales_channel, external_order_no, cash_received, change_given,
            points_earned, points_used, credit_used, cancelled_at, cancel_reason, refund_method,
            customers(name, phone, hn),
            profiles!transactions_cashier_id_fkey(name),
            transaction_items(quantity, unit_price, discount, subtotal, unit_name, unit_factor, base_quantity, products(name, unit, sku)),
            transaction_payments(method, amount)
          `)
          .eq('id', target.id)
          .single()
        if (!alive) return
        if (error) setError(error.message)
        else setReceipt(data as unknown as ReceiptDetail)
      } else if (target.kind === 'purchase') {
        const { data, error } = await supabase
          .from('purchases')
          .select(`
            purchase_number, created_at, received_at, notes, status, total_cost,
            suppliers(name, phone),
            purchase_items(quantity, received_quantity, unit_cost, unit_name, unit_factor, base_quantity, lot_number, expiry_date, products(name, unit, sku))
          `)
          .eq('id', target.id)
          .single()
        if (!alive) return
        if (error) setError(error.message)
        else setPurchase(data as unknown as PurchaseDetail)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [target])

  const Icon = ICON[target.kind]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <Icon size={18} className="text-blue-500 shrink-0" />
            <h2 className="font-semibold text-gray-900 truncate">{target.title}</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href={printHref(target)}
              target="_blank"
              title="พิมพ์"
              className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
            >
              <Printer size={16} />
            </Link>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {error && <p className="text-sm text-red-600">โหลดรายละเอียดไม่สำเร็จ · {error}</p>}
          {loading && !error && <p className="text-sm text-gray-400">กำลังโหลด...</p>}

          {target.kind === 'receipt' && receipt && <ReceiptBody tx={receipt} />}
          {target.kind === 'purchase' && purchase && <PurchaseBody po={purchase} />}
          {target.kind === 'stock' && <StockBody doc={target.stock} />}
        </div>
      </div>
    </div>
  )
}

function ReceiptBody({ tx }: { tx: ReceiptDetail }) {
  const hasItemDiscount = tx.transaction_items.some((it) => it.discount > 0)
  const splits = tx.transaction_payments ?? []

  return (
    <div className="space-y-4">
      {tx.status === 'cancelled' && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
          ยกเลิกแล้ว{tx.cancelled_at && ` · ${fmtDate(tx.cancelled_at)}`}
          {tx.cancel_reason && ` · ${tx.cancel_reason}`}
          {tx.refund_method && ` · คืนเป็น${REFUND_LABEL[tx.refund_method] ?? tx.refund_method}`}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        <Row label="วันที่ขาย" value={fmtDate(tx.created_at)} />
        <Row label="แคชเชียร์" value={tx.profiles?.name ?? '—'} />
        {tx.recorded_at && (
          <Row
            label="คีย์เข้าระบบ"
            value={
              <span className="text-amber-700">
                {fmtDate(tx.recorded_at)}
                {tx.backdate_reason && ` · ${tx.backdate_reason}`}
              </span>
            }
          />
        )}
        <Row
          label="ช่องทาง"
          value={
            <>
              <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${tx.sales_channel ? CHANNEL_BADGE[tx.sales_channel] : ''}`}>
                {tx.sales_channel ? CHANNEL_LABEL[tx.sales_channel] ?? tx.sales_channel : '—'}
              </span>
              {tx.external_order_no && <span className="ml-1 font-mono text-xs text-gray-400">{tx.external_order_no}</span>}
            </>
          }
        />
        <Row
          label="ลูกค้า"
          value={
            tx.customers
              ? `${tx.customers.name}${tx.customers.phone ? ` · ${tx.customers.phone}` : ''}${tx.customers.hn ? ` · HN ${tx.customers.hn}` : ''}`
              : 'ลูกค้าทั่วไป'
          }
        />
      </div>

      <div className="-mx-5 sm:mx-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-gray-50 border-y border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">รายการ</th>
              <th className="text-right text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">จำนวน</th>
              <th className="text-right text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">ราคา/หน่วย</th>
              {hasItemDiscount && <th className="text-right text-xs font-medium text-gray-500 px-3 py-2">ส่วนลด</th>}
              <th className="text-right text-xs font-medium text-gray-500 px-3 py-2">รวม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tx.transaction_items.map((it, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-2 text-gray-800">
                  {it.products?.name ?? 'สินค้า'}
                  {it.products?.sku && <span className="ml-1 font-mono text-xs text-gray-400">{it.products.sku}</span>}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                  {it.quantity} {it.unit_name ?? it.products?.unit ?? ''}
                  {/* ขายยกกล่อง/ยกลัง — กำกับว่าของออกจากสต็อกกี่หน่วยย่อย */}
                  {it.unit_factor > 1 && (
                    <span className="block text-[11px] text-gray-400">
                      = {it.base_quantity} {it.products?.unit ?? ''}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 tabular-nums whitespace-nowrap">{money(it.unit_price)}</td>
                {hasItemDiscount && (
                  <td className="px-3 py-2 text-right text-gray-500 tabular-nums">
                    {it.discount > 0 ? `-${money(it.discount)}` : '—'}
                  </td>
                )}
                <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums whitespace-nowrap">{money(it.subtotal)}</td>
              </tr>
            ))}
            {tx.transaction_items.length === 0 && (
              <tr>
                <td colSpan={hasItemDiscount ? 5 : 4} className="px-3 py-6 text-center text-sm text-gray-400">
                  บิลนี้ไม่มีรายการสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="w-full sm:w-72 space-y-1">
          <Row label="ยอดรวม" value={money(tx.subtotal)} />
          {tx.discount > 0 && <Row label="ส่วนลด" value={`-${money(tx.discount)}`} />}
          {tx.points_used > 0 && <Row label="ใช้แต้ม" value={`${tx.points_used} แต้ม`} />}
          {tx.credit_used > 0 && <Row label="ใช้เครดิต" value={`-${money(tx.credit_used)}`} />}
          {!!tx.rounding && (
            <Row label="ปัดเศษ" value={`${tx.rounding > 0 ? '+' : '-'}${money(Math.abs(tx.rounding))}`} />
          )}
          <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold text-gray-900">
            <span>ยอดสุทธิ</span>
            <span className="tabular-nums">฿{money(tx.total)}</span>
          </div>
          <div className="pt-1.5 space-y-1">
            {splits.length > 1 ? (
              splits.map((l, i) => <Row key={i} label={PAYMENT_LABEL[l.method] ?? l.method} value={money(Number(l.amount))} />)
            ) : (
              <Row
                label="รับเงิน"
                value={
                  (tx.sales_channel ? platformPaymentLabel(tx.sales_channel) : null) ??
                  PAYMENT_LABEL[tx.payment_method] ??
                  tx.payment_method
                }
              />
            )}
            {tx.payment_method === 'cash' && tx.cash_received != null && (
              <>
                <Row label="รับเงินมา" value={money(tx.cash_received)} />
                <Row label="เงินทอน" value={money(tx.change_given ?? 0)} />
              </>
            )}
            {tx.points_earned > 0 && <Row label="ได้แต้ม" value={`${tx.points_earned} แต้ม`} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function PurchaseBody({ po }: { po: PurchaseDetail }) {
  const hasLot = po.purchase_items.some((it) => it.lot_number || it.expiry_date)

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        <Row label="วันที่สั่ง" value={fmtDate(po.created_at)} />
        <Row
          label="ซัพพลายเออร์"
          value={po.suppliers ? `${po.suppliers.name}${po.suppliers.phone ? ` · ${po.suppliers.phone}` : ''}` : '—'}
        />
        <Row label="สถานะ" value={po.status === 'received' ? 'รับแล้ว' : 'รอรับสินค้า'} />
        {po.received_at && <Row label="รับของ" value={fmtDate(po.received_at)} />}
        {po.notes && <Row label="หมายเหตุ" value={po.notes} />}
      </div>

      <div className="-mx-5 sm:mx-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-gray-50 border-y border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">รายการ</th>
              <th className="text-right text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">สั่ง</th>
              <th className="text-right text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">รับแล้ว</th>
              {hasLot && <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">ล็อต / หมดอายุ</th>}
              <th className="text-right text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap">ทุน/หน่วย</th>
              <th className="text-right text-xs font-medium text-gray-500 px-3 py-2">รวม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {po.purchase_items.map((it, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-2 text-gray-800">
                  {it.products?.name ?? 'สินค้า'}
                  {it.products?.sku && <span className="ml-1 font-mono text-xs text-gray-400">{it.products.sku}</span>}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                  {it.quantity} {it.unit_name ?? it.products?.unit ?? ''}
                  {it.unit_factor > 1 && (
                    <span className="block text-[11px] text-gray-400">
                      = {it.base_quantity} {it.products?.unit ?? ''}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                  {it.received_quantity ?? '—'}
                </td>
                {hasLot && (
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {it.lot_number ?? '—'}
                    {it.expiry_date && <span className="block">หมด {fmtDay(it.expiry_date)}</span>}
                  </td>
                )}
                <td className="px-3 py-2 text-right text-gray-700 tabular-nums whitespace-nowrap">{money(it.unit_cost)}</td>
                <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums whitespace-nowrap">
                  {money(it.unit_cost * it.quantity)}
                </td>
              </tr>
            ))}
            {po.purchase_items.length === 0 && (
              <tr>
                <td colSpan={hasLot ? 6 : 5} className="px-3 py-6 text-center text-sm text-gray-400">
                  ใบนี้ไม่มีรายการสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="w-full sm:w-72">
          <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold text-gray-900">
            <span>ทุนรวม</span>
            <span className="tabular-nums">฿{money(po.total_cost)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function StockBody({ doc }: { doc: StockDocDetail }) {
  const cfg = MOVEMENT_LABEL[doc.type]

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        <Row label="วันที่" value={fmtDate(doc.createdAt)} />
        <Row
          label="ประเภท"
          value={
            <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>{cfg.text}</span>
          }
        />
        <Row label="เหตุผล" value={doc.note || '—'} />
        <Row label="โดย" value={doc.byName} />
      </div>

      <div className="-mx-5 sm:mx-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[380px]">
          <thead className="bg-gray-50 border-y border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">สินค้า</th>
              <th className="text-right text-xs font-medium text-gray-500 px-3 py-2">จำนวน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {doc.items.map((it, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-gray-800">
                  {it.name}
                  {it.sku && <span className="ml-1 font-mono text-xs text-gray-400">{it.sku}</span>}
                </td>
                <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${cfg.sign === '+' ? 'text-green-600' : 'text-red-500'}`}>
                  {cfg.sign}{it.quantity.toLocaleString('th-TH')} {it.unit}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className="px-3 py-2 text-sm font-semibold text-gray-900">รวม {doc.items.length} รายการ</td>
              <td className={`px-3 py-2 text-right text-sm font-semibold whitespace-nowrap ${cfg.sign === '+' ? 'text-green-600' : 'text-red-500'}`}>
                {cfg.sign}{doc.totalQty.toLocaleString('th-TH')}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
