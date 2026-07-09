'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PackageCheck, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

interface ReceiveItem {
  id: string
  product_id: string | null
  quantity: number
  unit_cost: number
  products: { name: string; sku: string | null; unit: string } | null
}

interface ReceivePurchase {
  id: string
  purchase_number: string
  notes: string | null
  suppliers: { name: string } | null
  purchase_items: ReceiveItem[]
}

interface RowState {
  itemId: string
  productName: string
  unit: string
  orderedQty: number
  receivedQty: string
  unitCost: string
  lotNumber: string
  supplierLot: string
  expiryDate: string
}

// LOT ระบบ: LOT + วันที่(2) เดือน(2) ปีค.ศ.(4) ของวันที่รับสินค้า
function defaultLot(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `LOT${dd}${mm}${yyyy}`
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function ReceiveClient({ purchase, receivedBy }: { purchase: ReceivePurchase; receivedBy: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<RowState[]>(
    purchase.purchase_items.map((it) => ({
      itemId: it.id,
      productName: it.products?.name ?? 'สินค้า (ถูกลบแล้ว)',
      unit: it.products?.unit ?? '',
      orderedQty: it.quantity,
      receivedQty: it.quantity.toString(),
      unitCost: it.unit_cost.toString(),
      lotNumber: defaultLot(),
      supplierLot: '',
      expiryDate: '',
    }))
  )

  function setRow(i: number, key: keyof RowState, value: string) {
    const next = [...rows]
    next[i] = { ...next[i], [key]: value }
    setRows(next)
  }

  const totalReceived = rows.reduce((sum, r) => sum + (parseInt(r.receivedQty) || 0), 0)
  const totalCost = rows.reduce(
    (sum, r) => sum + ((parseInt(r.receivedQty) || 0) * (parseFloat(r.unitCost) || 0)),
    0
  )
  const hasShortfall = rows.some((r) => (parseInt(r.receivedQty) || 0) < r.orderedQty)

  async function confirm() {
    setLoading(true)
    const supabase = createClient()

    const toReceive = rows.filter((r) => (parseInt(r.receivedQty) || 0) > 0)

    if (toReceive.length > 0) {
      const { error: lotErr } = await supabase.from('product_lots').insert(
        toReceive.map((r) => {
          const item = purchase.purchase_items.find((pi) => pi.id === r.itemId)!
          const qty = parseInt(r.receivedQty)
          return {
            product_id: item.product_id,
            lot_number: r.lotNumber.trim() || null,
            supplier_lot_number: r.supplierLot.trim() || null,
            expiry_date: r.expiryDate || null,
            quantity: qty,
            initial_quantity: qty,
          }
        })
      )
      if (lotErr) {
        toast.error('เพิ่มสต็อคไม่สำเร็จ: ' + lotErr.message)
        setLoading(false)
        return
      }
    }

    for (const r of rows) {
      await supabase
        .from('purchase_items')
        .update({
          received_quantity: parseInt(r.receivedQty) || 0,
          unit_cost: parseFloat(r.unitCost) || 0,
          lot_number: r.lotNumber.trim() || null,
          supplier_lot_number: r.supplierLot.trim() || null,
          expiry_date: r.expiryDate || null,
        })
        .eq('id', r.itemId)
    }

    const { error: pErr } = await supabase
      .from('purchases')
      .update({
        status: 'received',
        received_at: new Date().toISOString(),
        received_by: receivedBy || null,
        total_cost: totalCost,
      })
      .eq('id', purchase.id)

    setLoading(false)
    if (pErr) {
      toast.error('ปิดใบสั่งซื้อไม่สำเร็จ: ' + pErr.message)
      return
    }

    toast.success('รับสินค้าเรียบร้อย สต็อคเพิ่มแล้ว')
    router.push('/admin/receiving')
    router.refresh()
  }

  return (
    <div>
      <Link href="/admin/receiving" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} /> กลับไปหน้านำเข้าสินค้า
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">รับสินค้า</h1>
      <p className="text-sm text-gray-500 mb-6">
        ใบสั่งซื้อ <span className="font-mono">{purchase.purchase_number}</span>
        {purchase.suppliers && <> · {purchase.suppliers.name}</>}
        {purchase.notes && <> · {purchase.notes}</>}
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <p className="text-sm text-gray-500 mb-3">
          ถ้าของมาไม่ครบ แก้ช่อง &quot;รับจริง&quot; ให้ตรงกับที่ได้รับ ส่วนที่ขาดจะถือว่าไม่ได้รับ (ใบสั่งซื้อจะปิดทันทีหลังยืนยัน)
        </p>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-medium text-gray-500 uppercase">
                <th className="text-left pb-2 pr-2 min-w-40">สินค้า</th>
                <th className="text-right pb-2 pr-2 w-20">สั่ง</th>
                <th className="text-left pb-2 pr-2 w-24">รับจริง</th>
                <th className="text-left pb-2 pr-2 w-28">ทุน/หน่วย</th>
                <th className="text-left pb-2 pr-2 w-32">LOT (ระบบ)</th>
                <th className="text-left pb-2 pr-2 w-32">LOT บริษัท</th>
                <th className="text-left pb-2 pr-2 w-36">วันหมดอายุ</th>
                <th className="text-right pb-2 w-24">รวม</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rowTotal = (parseInt(r.receivedQty) || 0) * (parseFloat(r.unitCost) || 0)
                const short = (parseInt(r.receivedQty) || 0) < r.orderedQty
                return (
                  <tr key={r.itemId}>
                    <td className="pr-2 py-1.5 text-sm text-gray-900">{r.productName}</td>
                    <td className="pr-2 py-1.5 text-sm text-right text-gray-500">{r.orderedQty} {r.unit}</td>
                    <td className="pr-2 py-1.5">
                      <input
                        type="number" min="0" value={r.receivedQty}
                        onChange={(e) => setRow(i, 'receivedQty', e.target.value)}
                        className={`${inputClass} ${short ? 'border-amber-400 bg-amber-50' : ''}`}
                      />
                    </td>
                    <td className="pr-2 py-1.5">
                      <input
                        type="number" min="0" step="0.01" value={r.unitCost}
                        onChange={(e) => setRow(i, 'unitCost', e.target.value)}
                        className={inputClass}
                      />
                    </td>
                    <td className="pr-2 py-1.5">
                      <input type="text" value={r.lotNumber} onChange={(e) => setRow(i, 'lotNumber', e.target.value)} className={inputClass} />
                    </td>
                    <td className="pr-2 py-1.5">
                      <input type="text" value={r.supplierLot} onChange={(e) => setRow(i, 'supplierLot', e.target.value)} className={inputClass} placeholder="ถ้ามี" />
                    </td>
                    <td className="pr-2 py-1.5">
                      <input type="date" value={r.expiryDate} onChange={(e) => setRow(i, 'expiryDate', e.target.value)} className={inputClass} />
                    </td>
                    <td className="py-1.5 text-sm text-right font-medium text-gray-900">
                      {rowTotal > 0 ? `฿${rowTotal.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            รับจริงรวม {totalReceived} ชิ้น · ทุนรวม <span className="font-bold text-gray-900">฿{totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
            {hasShortfall && <span className="text-amber-600 ml-2">มีบางรายการรับไม่ครบ</span>}
          </p>
          <button
            onClick={confirm}
            disabled={loading}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            <PackageCheck size={16} />
            {loading ? 'กำลังบันทึก...' : 'ยืนยันรับสินค้า'}
          </button>
        </div>
      </div>
    </div>
  )
}
