'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PackageCheck, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import DateField from '@/components/DateField'
import { ProductPicker, UnitSelect, findUnitChoice, qtyInputClass, useUnitAdder, type ProductOption } from '../../pickers'

interface ReceiveItem {
  id: string
  product_id: string | null
  product_unit_id: string | null
  unit_factor: number | null
  unit_name: string | null
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
  // null = รายการที่เพิ่มตอนรับของ (ของมาเกินใบสั่งซื้อ) ยังไม่มีแถวใน purchase_items
  itemId: string | null
  productId: string | null
  productName: string
  /** หน่วยฐานของสินค้า — สต็อคเข้าเป็นหน่วยนี้เสมอ */
  unit: string
  /** หน่วยที่สั่งมา ('' = หน่วยฐาน) */
  unitId: string
  /** จำนวนหน่วยฐานต่อ 1 หน่วยที่สั่ง */
  factor: number
  /** ชื่อหน่วยที่สั่ง (ลัง/กล่อง) */
  unitLabel: string
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

export default function ReceiveClient({
  purchase, receivedBy, products,
}: {
  purchase: ReceivePurchase
  receivedBy: string
  products: ProductOption[]
}) {
  const router = useRouter()
  const addUnit = useUnitAdder(products)
  const [loading, setLoading] = useState(false)
  // รายการที่ถูกลบออกตอนรับของ — ลบออกจากใบสั่งซื้อตอนกดยืนยัน
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [rows, setRows] = useState<RowState[]>(
    purchase.purchase_items.map((it) => ({
      itemId: it.id,
      productId: it.product_id,
      productName: it.products?.name ?? 'สินค้า (ถูกลบแล้ว)',
      unit: it.products?.unit ?? '',
      unitId: it.product_unit_id ?? '',
      factor: it.unit_factor ?? 1,
      unitLabel: it.unit_name ?? it.products?.unit ?? '',
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

  // ของมาเกินใบสั่งซื้อ — เพิ่มเข้าใบนี้ได้เลย ไม่ต้องเปิดใบใหม่
  function addRow() {
    setRows([...rows, {
      itemId: null,
      productId: null,
      productName: '',
      unit: '',
      unitId: '',
      factor: 1,
      unitLabel: '',
      orderedQty: 0,
      receivedQty: '',
      unitCost: '',
      lotNumber: defaultLot(),
      supplierLot: '',
      expiryDate: '',
    }])
  }

  function pickProduct(i: number, id: string) {
    const p = products.find((x) => x.id === id)
    const next = [...rows]
    next[i] = {
      ...next[i],
      productId: id,
      productName: p?.name ?? '',
      unit: p?.unit ?? '',
      unitId: '',
      factor: 1,
      unitLabel: p?.unit ?? '',
      unitCost: next[i].unitCost || (p?.cost != null ? String(p.cost) : ''),
    }
    setRows(next)
  }

  /** เปลี่ยนหน่วยที่รับ (ลัง/กล่อง) — ทุนต่อหน่วยกับตัวคูณเปลี่ยนตาม */
  function pickUnit(i: number, unitId: string) {
    const row = rows[i]
    const p = products.find((x) => x.id === row.productId)
    const choice = findUnitChoice(p, unitId)
    const next = [...rows]
    next[i] = {
      ...row,
      unitId,
      factor: choice?.factor ?? 1,
      unitLabel: choice?.name ?? row.unit,
      unitCost: choice?.cost != null ? String(choice.cost) : row.unitCost,
    }
    setRows(next)
  }

  function removeRow(i: number) {
    const row = rows[i]
    if (row.itemId) setRemovedIds([...removedIds, row.itemId])
    setRows(rows.filter((_, idx) => idx !== i))
  }

  const totalReceived = rows.reduce((sum, r) => sum + (parseInt(r.receivedQty) || 0) * (r.factor || 1), 0)
  const totalCost = rows.reduce(
    (sum, r) => sum + ((parseInt(r.receivedQty) || 0) * (parseFloat(r.unitCost) || 0)),
    0
  )
  const hasShortfall = rows.some((r) => (parseInt(r.receivedQty) || 0) < r.orderedQty)

  async function confirm() {
    if (rows.some((r) => !r.productId)) {
      toast.error('ยังมีแถวที่ยังไม่ได้เลือกสินค้า')
      return
    }
    setLoading(true)
    const supabase = createClient()

    // ถอดรายการที่ของไม่มาออกจากใบก่อน (กดถังขยะไว้)
    if (removedIds.length > 0) {
      const { error } = await supabase.from('purchase_items').delete().in('id', removedIds)
      if (error) {
        toast.error('ลบรายการไม่สำเร็จ: ' + error.message)
        setLoading(false)
        return
      }
    }

    // รายการที่เพิ่งเพิ่มตอนรับของ ต้องมีแถวในใบสั่งซื้อก่อน ถึงจะอ้างอิงกันได้ทีหลัง
    const added = rows.filter((r) => !r.itemId && r.productId)
    if (added.length > 0) {
      const { data: newItems, error } = await supabase
        .from('purchase_items')
        .insert(added.map((r) => ({
          purchase_id: purchase.id,
          product_id: r.productId,
          product_unit_id: r.unitId || null,
          unit_factor: r.factor || 1,
          unit_name: r.unitId ? r.unitLabel : null,
          quantity: parseInt(r.receivedQty) || 1,
          unit_cost: parseFloat(r.unitCost) || 0,
        })))
        .select('id, product_id')
      if (error || !newItems) {
        toast.error('เพิ่มรายการไม่สำเร็จ: ' + (error?.message ?? ''))
        setLoading(false)
        return
      }
      // จับคู่ id ที่เพิ่งได้กลับเข้าแถว — เทียบจาก product_id ไม่พึ่งลำดับที่ฐานข้อมูลคืนมา
      const byProduct = new Map<string, string[]>()
      for (const it of newItems) {
        const list = byProduct.get(it.product_id) ?? []
        list.push(it.id)
        byProduct.set(it.product_id, list)
      }
      for (const r of added) {
        r.itemId = byProduct.get(r.productId!)?.shift() ?? null
      }
    }

    const toReceive = rows.filter((r) => (parseInt(r.receivedQty) || 0) > 0)

    if (toReceive.length > 0) {
      const { data: newLots, error: lotErr } = await supabase
        .from('product_lots')
        .insert(
          toReceive.map((r) => {
            // รับมา 2 ลัง = เข้าสต็อค 2 × จำนวนต่อลัง เพราะสต็อคนับเป็นหน่วยย่อยกองเดียว
            const qty = parseInt(r.receivedQty) * (r.factor || 1)
            return {
              product_id: r.productId,
              lot_number: r.lotNumber.trim() || null,
              supplier_lot_number: r.supplierLot.trim() || null,
              expiry_date: r.expiryDate || null,
              quantity: qty,
              initial_quantity: qty,
            }
          })
        )
        .select('id, product_id, quantity')
      if (lotErr) {
        toast.error('เพิ่มสต็อคไม่สำเร็จ: ' + lotErr.message)
        setLoading(false)
        return
      }

      if (newLots) {
        await supabase.from('stock_movements').insert(
          newLots.map((lot) => ({
            product_id: lot.product_id,
            product_lot_id: lot.id,
            type: 'receive' as const,
            quantity: lot.quantity,
            reason: purchase.purchase_number,
            created_by: receivedBy || null,
          }))
        )
      }
    }

    for (const r of rows) {
      if (!r.itemId) continue
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

    // แจ้งเตือน Telegram — งานเสริม ล้มเหลวไม่ให้กระทบการรับของ
    fetch('/api/notify/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseId: purchase.id, stage: 'received' }),
    }).catch(() => {})

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
          ถ้าของมาไม่ครบ แก้ช่อง &quot;รับจริง&quot; ให้ตรงกับที่ได้รับ · ของไม่มาเลยกดถังขยะถอดออกได้ · ของมาเกินใบกด &quot;เพิ่มรายการที่ไม่ได้สั่ง&quot; (ใบสั่งซื้อจะปิดทันทีหลังยืนยัน)
        </p>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-medium text-gray-500 uppercase">
                <th className="text-left pb-2 pr-2 min-w-40">สินค้า</th>
                <th className="text-right pb-2 pr-2 min-w-20 whitespace-nowrap">สั่ง</th>
                <th className="text-left pb-2 pr-2 min-w-44 whitespace-nowrap">รับจริง</th>
                <th className="text-left pb-2 pr-2 w-28">ทุน/หน่วย</th>
                <th className="text-left pb-2 pr-2 w-32">LOT (ระบบ)</th>
                <th className="text-left pb-2 pr-2 w-32">LOT บริษัท</th>
                <th className="text-left pb-2 pr-2 w-36">วันหมดอายุ</th>
                <th className="text-right pb-2 pr-2 w-24">รวม</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rowTotal = (parseInt(r.receivedQty) || 0) * (parseFloat(r.unitCost) || 0)
                const short = (parseInt(r.receivedQty) || 0) < r.orderedQty
                return (
                  <tr key={r.itemId ?? `new-${i}`}>
                    <td className="pr-2 py-1.5 text-sm text-gray-900">
                      {r.itemId ? r.productName : (
                        <ProductPicker
                          products={products}
                          value={r.productId ?? ''}
                          onChange={(id) => pickProduct(i, id)}
                          supplierId=""
                        />
                      )}
                    </td>
                    <td className="pr-2 py-1.5 text-sm text-right text-gray-500 whitespace-nowrap">
                      {r.itemId ? `${r.orderedQty} ${r.unitLabel || r.unit}` : <span className="text-amber-600">ไม่ได้สั่ง</span>}
                    </td>
                    <td className="pr-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min="0" value={r.receivedQty}
                          onChange={(e) => setRow(i, 'receivedQty', e.target.value)}
                          className={`${qtyInputClass} ${short ? 'border-amber-400 bg-amber-50' : ''}`}
                        />
                        {r.itemId ? (
                          <span className="shrink-0 text-xs text-gray-500">{r.unitLabel || r.unit}</span>
                        ) : (
                          <UnitSelect
                            product={products.find((x) => x.id === r.productId)}
                            value={r.unitId}
                            onChange={(id) => pickUnit(i, id)}
                            onUnitAdded={addUnit}
                          />
                        )}
                      </div>
                      {r.factor > 1 && (parseInt(r.receivedQty) || 0) > 0 && (
                        <p className="mt-0.5 pl-1 text-[11px] text-gray-400">
                          เข้าสต็อค {(parseInt(r.receivedQty) || 0) * r.factor} {r.unit}
                        </p>
                      )}
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
                      <DateField
                        value={r.expiryDate}
                        onChange={(v) => setRow(i, 'expiryDate', v)}
                        className={inputClass}
                        aria-label="วันหมดอายุ"
                      />
                    </td>
                    <td className="pr-2 py-1.5 text-sm text-right font-medium text-gray-900">
                      {rowTotal > 0 ? `฿${rowTotal.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => removeRow(i)}
                        title="ถอดรายการนี้ออกจากใบสั่งซื้อ"
                        className="p-1 text-gray-300 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium mt-2">
          <Plus size={14} /> เพิ่มรายการที่ไม่ได้สั่ง
        </button>

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
