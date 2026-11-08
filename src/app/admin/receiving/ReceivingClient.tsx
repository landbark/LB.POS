'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, PackagePlus, Printer, PackageCheck, ListPlus, Pencil } from 'lucide-react'
import { confirmDialog } from '@/lib/confirm'
import toast from 'react-hot-toast'
import type { PurchaseStatus, Supplier } from '@/lib/types'
import { ProductPicker, MultiPicker, StockBadge, UnitSelect, newItem, inputClass, qtyInputClass, findUnitChoice, factorOfRow, useUnitAdder, type ProductOption, type ItemRow } from './pickers'

// เลขที่ใบรับของอิงเวลาที่กดบันทึก — อยู่นอกคอมโพเนนต์ให้ชัดว่าไม่ใช่ค่าที่คิดตอน render
const newPurchaseNumber = () => `PO${Date.now()}`

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

interface PurchaseRow {
  id: string
  purchase_number: string
  total_cost: number
  notes: string | null
  status: PurchaseStatus
  created_at: string
  suppliers: { name: string } | null
  purchase_items: { id: string }[]
}

interface Props {
  suppliers: Supplier[]
  products: ProductOption[]
  purchases: PurchaseRow[]
}

export default function ReceivingClient({ suppliers, products, purchases }: Props) {
  const router = useRouter()
  const addUnit = useUnitAdder(products)
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([newItem()])
  const [loading, setLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  // สินค้าของซัพพลายเออร์ที่เลือกขึ้นก่อนในผลค้นหา
  const sortedProducts = supplierId
    ? [...products].sort((a, b) => {
        const aMatch = a.supplier_id === supplierId ? 0 : 1
        const bMatch = b.supplier_id === supplierId ? 0 : 1
        return aMatch - bMatch || a.name.localeCompare(b.name, 'th')
      })
    : products

  function setItem(index: number, key: keyof ItemRow, value: string) {
    const next = [...items]
    next[index] = { ...next[index], [key]: value }
    if (key === 'product_id') {
      // เปลี่ยนสินค้า = หน่วยเดิมใช้ไม่ได้แล้ว กลับไปเป็นหน่วยฐานก่อน
      next[index].product_unit_id = ''
      const p = products.find((x) => x.id === value)
      if (p?.cost != null && !next[index].unit_cost) {
        next[index].unit_cost = p.cost.toString()
      }
    }
    if (key === 'product_id' || key === 'product_unit_id') {
      // ทุนต่อหน่วยที่สั่ง — สั่งเป็นลังต้องเป็นทุนต่อลัง ไม่ใช่ต่อซอง
      const p = products.find((x) => x.id === next[index].product_id)
      const choice = findUnitChoice(p, next[index].product_unit_id)
      if (choice?.cost != null) next[index].unit_cost = String(choice.cost)
    }
    setItems(next)
  }

  function addRow() {
    setItems([...items, newItem()])
  }

  // เพิ่มสินค้าหลายตัวรวดเดียว — เติมราคาทุนล่าสุดให้เลย แล้วเขียนทับแถวว่างที่ค้างอยู่
  function addMany(ids: string[]) {
    if (ids.length === 0) return
    const rows: ItemRow[] = ids.map((id) => {
      const p = products.find((x) => x.id === id)
      return { product_id: id, product_unit_id: '', quantity: '1', unit_cost: p?.cost != null ? String(p.cost) : '' }
    })
    const kept = items.filter((it) => it.product_id)
    setItems([...kept, ...rows])
    toast.success(`เพิ่ม ${rows.length} รายการแล้ว`)
  }

  const pickedIds = new Set(items.map((it) => it.product_id).filter(Boolean))
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? ''

  function removeRow(index: number) {
    if (items.length === 1) {
      setItems([newItem()])
      return
    }
    setItems(items.filter((_, i) => i !== index))
  }

  // ลบได้เฉพาะใบที่ยังไม่รับของ — รับแล้วของเข้าล็อตไปแล้ว ลบใบทิ้งจะทำให้สต็อคไม่มีที่มา
  async function removePurchase(id: string, number: string) {
    const { confirmed } = await confirmDialog({
      title: 'ลบใบสั่งซื้อ?',
      message: `ลบใบ ${number} ทิ้ง — ยังไม่ได้รับของ สต็อคไม่กระทบ`,
      confirmLabel: 'ลบทิ้ง',
      tone: 'danger',
    })
    if (!confirmed) return
    const supabase = createClient()
    const { error } = await supabase.from('purchases').delete().eq('id', id)
    if (error) {
      toast.error('ลบไม่สำเร็จ: ' + error.message)
      return
    }
    toast.success(`ลบใบ ${number} แล้ว`)
    router.refresh()
  }

  const validItems = items.filter((it) => it.product_id && parseInt(it.quantity) > 0)
  const totalCost = validItems.reduce(
    (sum, it) => sum + (parseFloat(it.unit_cost) || 0) * (parseInt(it.quantity) || 0),
    0
  )

  async function save() {
    if (validItems.length === 0) {
      toast.error('ใส่รายการสินค้าอย่างน้อย 1 รายการ')
      return
    }
    setLoading(true)
    const supabase = createClient()

    const { data: purchase, error: pErr } = await supabase
      .from('purchases')
      .insert({
        purchase_number: newPurchaseNumber(),
        supplier_id: supplierId || null,
        total_cost: totalCost,
        notes: notes.trim() || null,
      })
      .select('id')
      .single()

    if (pErr || !purchase) {
      toast.error('บันทึกไม่สำเร็จ: ' + pErr?.message)
      setLoading(false)
      return
    }

    const { error: iErr } = await supabase.from('purchase_items').insert(
      validItems.map((it) => {
        const p = products.find((x) => x.id === it.product_id)
        const choice = findUnitChoice(p, it.product_unit_id)
        return {
          purchase_id: purchase.id,
          product_id: it.product_id,
          // สั่งเป็นลัง = quantity นับเป็นลัง, ของเข้าสต็อคคิดจาก base_quantity ที่ DB คูณให้
          product_unit_id: choice?.unit?.id ?? null,
          unit_factor: choice?.factor ?? 1,
          unit_name: choice?.unit?.unit_name ?? null,
          quantity: parseInt(it.quantity),
          unit_cost: parseFloat(it.unit_cost) || 0,
        }
      })
    )

    if (iErr) {
      setLoading(false)
      toast.error('บันทึกรายการไม่สำเร็จ: ' + iErr.message)
      return
    }

    // สั่งของตัวนี้จากเจ้านี้ = ผูกให้เลย ครั้งหน้าจะขึ้นมาก่อนในช่องเลือก
    // แตะเฉพาะตัวที่ยังไม่มีเจ้าประจำ ไม่ไปทับของที่ตั้งไว้แล้ว
    let linked = 0
    if (supplierId) {
      const unlinked = validItems
        .map((it) => products.find((p) => p.id === it.product_id))
        .filter((p): p is ProductOption => !!p && !p.supplier_id)
        .map((p) => p.id)
      if (unlinked.length > 0) {
        const { error: linkErr } = await supabase
          .from('products')
          .update({ supplier_id: supplierId })
          .in('id', unlinked)
        if (!linkErr) linked = unlinked.length
      }
    }

    fetch('/api/notify/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseId: purchase.id, stage: 'created' }),
    }).catch(() => {})

    setLoading(false)

    // ยังไม่เพิ่มสต็อค — สต็อคจะเข้าตอนพนักงานกด "รับสินค้า" พร้อมใส่ล็อต/วันหมดอายุ
    toast.success(
      `บันทึกใบสั่งซื้อ ${validItems.length} รายการแล้ว รอรับสินค้า` +
      (linked > 0 ? ` · ผูก ${linked} สินค้ากับซัพพลายเออร์นี้ให้แล้ว` : '')
    )
    setSupplierId('')
    setNotes('')
    setItems([newItem()])
    router.refresh()
  }

  /**
   * แถวสินค้าหนึ่งแถววาดสองชุด — การ์ดบนจอเล็ก ตารางบนจอใหญ่
   * ช่องกรอกเลยแยกมาไว้ที่เดียว ไม่งั้นแก้ช่องจำนวนทีต้องไล่แก้สองที่
   */
  const productCell = (it: ItemRow, i: number) => {
    const p = products.find((x) => x.id === it.product_id)
    return (
      <>
        <ProductPicker
          products={sortedProducts}
          value={it.product_id}
          onChange={(id) => setItem(i, 'product_id', id)}
          supplierId={supplierId}
        />
        {p && <p className="mt-0.5 pl-1"><StockBadge product={p} /></p>}
      </>
    )
  }

  const qtyCell = (it: ItemRow, i: number) => {
    const p = products.find((x) => x.id === it.product_id)
    const factor = factorOfRow(p, it.product_unit_id)
    const qty = parseInt(it.quantity) || 0
    return (
      <>
        <div className="flex items-center gap-1.5">
          <input type="number" min="1" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} className={qtyInputClass} placeholder="0" />
          <UnitSelect product={p} value={it.product_unit_id} onChange={(id) => setItem(i, 'product_unit_id', id)} onUnitAdded={addUnit} />
        </div>
        {factor > 1 && qty > 0 && (
          <p className="mt-0.5 pl-1 text-[11px] text-gray-400">
            เข้าสต็อค {qty * factor} {p?.unit}
          </p>
        )}
      </>
    )
  }

  const costCell = (it: ItemRow, i: number) => (
    <input type="number" min="0" step="0.01" value={it.unit_cost} onChange={(e) => setItem(i, 'unit_cost', e.target.value)} className={inputClass} placeholder="0.00" />
  )

  const rowTotalOf = (it: ItemRow) => (parseFloat(it.unit_cost) || 0) * (parseInt(it.quantity) || 0)

  // ป้ายสถานะห้ามตัดบรรทัด — "รอรับสินค้า" ในคอลัมน์แคบจะม้วนเป็นก้อนกลม (บทเรียนจากหน้าเอกสาร)
  const statusBadge = (status: PurchaseStatus) => (
    <span className={`inline-flex shrink-0 whitespace-nowrap text-xs px-2 py-0.5 rounded-full font-medium ${
      status === 'received' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
    }`}>
      {status === 'received' ? 'รับแล้ว' : 'รอรับสินค้า'}
    </span>
  )

  const purchaseActions = (p: PurchaseRow) => (
    <>
      <Link
        href={`/print/purchase/${p.id}`}
        target="_blank"
        title="พิมพ์ PDF"
        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg"
      >
        <Printer size={15} />
      </Link>
      {p.status === 'pending' && (
        <>
          <Link
            href={`/admin/receiving/${p.id}/edit`}
            title="แก้ไขใบสั่งซื้อ"
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg"
          >
            <Pencil size={15} />
          </Link>
          <button
            onClick={() => removePurchase(p.id, p.purchase_number)}
            title="ลบใบสั่งซื้อ"
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg"
          >
            <Trash2 size={15} />
          </button>
          <Link
            href={`/admin/receiving/${p.id}/receive`}
            className="flex items-center gap-1 whitespace-nowrap text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <PackageCheck size={13} /> รับสินค้า
          </Link>
        </>
      )}
    </>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">นำเข้าสินค้า</h1>
      <p className="text-sm text-gray-500 mb-6">
        สร้างใบสั่งซื้อส่งซัพพลายเออร์ก่อน แล้วค่อยกด &quot;รับสินค้า&quot; ใส่ล็อต/วันหมดอายุตอนของมาส่งจริง
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">สร้างใบสั่งซื้อ</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ซัพพลายเออร์</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
              <option value="">— ไม่ระบุ —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="เช่น เลขที่บิล / รอบส่ง" />
          </div>
        </div>

        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium px-3 py-2 rounded-lg"
          >
            <ListPlus size={15} />
            เลือกสินค้าหลายรายการ
          </button>
        </div>

        {/* ต่ำกว่า lg ใช้การ์ด — ห้าคอลัมน์ (ชื่อสินค้า จำนวน หน่วย ทุน รวม) กินอย่างน้อย ~710px
            หักแถบเมนูซ้าย 224px แล้วตารางลงตัวตั้งแต่จอ ~1000px ขึ้นไป
            ต่ำกว่านั้นตารางดันทั้งหน้าให้เลื่อนแนวนอน ทั้งที่ของที่ต้องกรอกมีแค่สี่ช่อง */}
        <div className="space-y-3 lg:hidden">
          {items.map((it, i) => {
            const rowTotal = rowTotalOf(it)
            return (
              <div key={i} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">{productCell(it, i)}</div>
                  <button
                    onClick={() => removeRow(i)}
                    title="ลบรายการ"
                    className="shrink-0 p-2 text-gray-300 hover:text-red-500 hover:bg-gray-50 rounded-lg"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="mt-2.5">
                  <span className="mb-1 block text-xs font-medium text-gray-500">จำนวน / หน่วย</span>
                  {qtyCell(it, i)}
                </div>

                <div className="mt-2.5 flex items-end gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="mb-1 block text-xs font-medium text-gray-500">ทุน/หน่วยที่สั่ง</span>
                    {costCell(it, i)}
                  </div>
                  <p className="shrink-0 pb-2 text-sm font-medium text-gray-900">
                    <span className="text-xs font-normal text-gray-500">รวม </span>
                    {rowTotal > 0 ? `฿${rowTotal.toFixed(2)}` : '—'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* รายการสินค้า — ตารางแคบพอ ไม่ต้อง overflow-x-auto (dropdown ของ ProductPicker ลอยที่ body อยู่แล้ว) */}
        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase">
                {/* font-medium ต้องอยู่ที่ th เอง — เบราว์เซอร์ตั้ง th เป็นตัวหนาไว้ในสไตล์ของตัวเอง
                    ซึ่งชนะค่าที่สืบทอดมาจาก tr หัวตารางเลยหนา 700 ทั้งที่ตั้งใจให้เป็น 500
                    พอหัวที่ตัดบรรทัดอย่าง "ทุน/หน่วยที่สั่ง" เป็นตัวหนา หมึกพุ่งขึ้น 1.25 em
                    เท่ากับความสูงบรรทัดพอดี วรรณยุกต์เลยไปเบียดบรรทัดบนจนดูเหมือนหัวขาด */}
                <th className="text-left font-medium pb-2 pr-2 min-w-56">สินค้า</th>
                <th className="text-left font-medium pb-2 pr-2 min-w-56 whitespace-nowrap">จำนวน / หน่วย</th>
                <th className="text-left font-medium pb-2 pr-2 w-28">ทุน/หน่วยที่สั่ง</th>
                <th className="text-right font-medium pb-2 w-24">รวม</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const rowTotal = rowTotalOf(it)
                return (
                  <tr key={i}>
                    <td className="pr-2 py-1.5 align-top">{productCell(it, i)}</td>
                    <td className="pr-2 py-1.5 align-top">{qtyCell(it, i)}</td>
                    <td className="pr-2 py-1.5 align-top">{costCell(it, i)}</td>
                    <td className="py-1.5 pt-4 align-top text-sm text-right font-medium text-gray-900">
                      {rowTotal > 0 ? `฿${rowTotal.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-1.5 pt-3 align-top text-right">
                      <button onClick={() => removeRow(i)} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium mt-3">
          <Plus size={14} /> เพิ่มรายการ
        </button>

        {/* จอเล็กเรียงบนล่าง — เดิมยอดรวมกับปุ่มเบียดกันจนคำว่า "บันทึกใบสั่งซื้อ" ตัดเป็นสองบรรทัด */}
        <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-100 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            {validItems.length} รายการ · ทุนรวม <span className="font-bold text-gray-900">฿{money(totalCost)}</span>
          </p>
          <button
            onClick={save}
            disabled={loading || validItems.length === 0}
            className="flex items-center justify-center gap-2 whitespace-nowrap bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            <PackagePlus size={16} />
            {loading ? 'กำลังบันทึก...' : 'บันทึกใบสั่งซื้อ'}
          </button>
        </div>
      </div>

      {/* ประวัติใบสั่งซื้อ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">ประวัติใบสั่งซื้อ</h2>
        </div>

        {/* ต่ำกว่า lg ใช้การ์ด — เจ็ดคอลัมน์บีบจนชื่อซัพพลายเออร์แตกเป็นคำละบรรทัด
            และวันที่หักเป็นสามบรรทัด (แบบเดียวกับหน้าเอกสาร) */}
        <div className="divide-y divide-gray-100 lg:hidden">
          {purchases.map((p) => (
            <div key={p.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-gray-700">{p.purchase_number}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {fmtDate(p.created_at)} · {p.purchase_items?.length ?? 0} รายการ
                  </p>
                </div>
                {statusBadge(p.status)}
              </div>
              <p className="mt-1.5 text-sm text-gray-700">{p.suppliers?.name ?? '—'}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">฿{money(p.total_cost)}</p>
                <div className="flex items-center gap-0.5">{purchaseActions(p)}</div>
              </div>
            </div>
          ))}
          {purchases.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีใบสั่งซื้อ</p>
          )}
        </div>

        {/* ตารางยังกว้างกว่าพื้นที่ในช่วง lg ต้น ๆ — ให้เลื่อนในการ์ด ไม่ใช่ดันทั้งหน้า */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เลขที่</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ซัพพลายเออร์</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">รายการ</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ทุนรวม</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {purchases.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">{p.purchase_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{p.suppliers?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">{p.purchase_items?.length ?? 0}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">
                    ฿{money(p.total_cost)}
                  </td>
                  <td className="px-4 py-3 text-center">{statusBadge(p.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-0.5 justify-end">{purchaseActions(p)}</div>
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">ยังไม่มีใบสั่งซื้อ</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPicker && (
        <MultiPicker
          products={sortedProducts}
          supplierId={supplierId}
          supplierName={supplierName}
          alreadyPicked={pickedIds}
          onAdd={addMany}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>

  )
}
