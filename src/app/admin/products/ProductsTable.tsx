'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import ProductRow from './ProductRow'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/lib/confirm'
import { isVatApplicable } from '@/lib/vat'
import type { Product } from '@/lib/types'

// แสดงทีละชุด — ร้านมีสินค้าสองพันกว่าตัว วาดทั้งตารางทีเดียวหน้าหนืด
const PAGE = 50

/**
 * ตารางสินค้า + ช่องค้นหา
 *
 * ค้นในเครื่องทั้งหมด ไม่ยิง DB ซ้ำ — ของทั้งร้านโหลดมาอยู่แล้ว (ปุ่ม Shopee ต้องใช้ทุกตัว)
 * พิมพ์ได้หลายคำ ไม่ต้องเรียงให้ตรงกับชื่อ: "royal renal 400" เจอ ROYAL CANIN ... RENAL ... 400 G.
 */
export default function ProductsTable({ products }: { products: Product[] }) {
  const router = useRouter()
  // ติ๊กหลายตัวแล้วตั้งค่าทีเดียว — ร้านมีสินค้าสองพันตัว เข้าไปแก้ทีละตัวไม่ไหว
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [hideStopped, setHideStopped] = useState(false)
  // '' = ทุกตัว, 'yes' = เฉพาะที่เข้าข่าย VAT, 'no' = เฉพาะที่ไม่เข้าข่าย
  const [vatFilter, setVatFilter] = useState<'' | 'yes' | 'no'>('')
  const [shown, setShown] = useState(PAGE)

  const haystacks = useMemo(
    () =>
      new Map(
        products.map((p) => [
          p.id,
          [p.name, p.sku, p.barcode, p.categories?.name, p.unit]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        ]),
      ),
    [products],
  )

  const stoppedCount = useMemo(() => products.filter((p) => !p.active).length, [products])

  const found = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    let pool = hideStopped ? products.filter((p) => p.active) : products
    if (vatFilter) {
      const want = vatFilter === 'yes'
      pool = pool.filter((p) => isVatApplicable(p) === want)
    }
    if (terms.length === 0) return pool
    return pool.filter((p) => {
      const haystack = haystacks.get(p.id) ?? ''
      return terms.every((t) => haystack.includes(t))
    })
  }, [products, haystacks, query, hideStopped, vatFilter])

  function search(value: string) {
    setQuery(value)
    setShown(PAGE) // ค้นใหม่แล้วกลับไปเริ่มที่ชุดแรก ไม่ค้างอยู่หน้าลึกๆ ของผลเก่า
  }

  function toggleOne(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** ตั้งค่า VAT ให้ทุกตัวที่ติ๊กไว้ — true = มี, false = ไม่มี, null = ใช้ตามหมวดหมู่ */
  async function applyVat(value: boolean | null) {
    const ids = [...picked]
    if (ids.length === 0) return
    const label = value === null ? 'ใช้ตามหมวดหมู่' : value ? 'มี VAT' : 'ไม่มี VAT'
    const { confirmed } = await confirmDialog({
      title: `ตั้งเป็น "${label}"?`,
      message: `สินค้าที่เลือกไว้ ${ids.length.toLocaleString('th-TH')} รายการจะถูกตั้งเป็น ${label}`,
      confirmLabel: 'ตั้งค่า',
      tone: 'primary',
    })
    if (!confirmed) return

    setSaving(true)
    const supabase = createClient()
    // ยัด id เป็นพันตัวใน .in() ทีเดียวไม่ได้ ความยาว URL เกินลิมิต — แบ่งเป็นชุดละ 200
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase
        .from('products')
        .update({ vat_applicable: value })
        .in('id', ids.slice(i, i + 200))
      if (error) {
        setSaving(false)
        toast.error('ตั้งค่าไม่สำเร็จ: ' + error.message)
        return
      }
    }
    setSaving(false)
    setPicked(new Set())
    toast.success(`ตั้ง ${ids.length.toLocaleString('th-TH')} รายการเป็น ${label} แล้ว`)
    router.refresh()
  }

  const visible = found.slice(0, shown)
  const count = (n: number) => n.toLocaleString('th-TH')
  const allVisiblePicked = visible.length > 0 && visible.every((p) => picked.has(p.id))

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า / SKU / บาร์โค้ด / หมวด"
            className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
          {query && (
            <button
              onClick={() => search('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="ล้างคำค้น"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <select
          value={vatFilter}
          onChange={(e) => { setVatFilter(e.target.value as '' | 'yes' | 'no'); setShown(PAGE) }}
          className="shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">VAT: ทั้งหมด</option>
          <option value="yes">เฉพาะที่มี VAT</option>
          <option value="no">เฉพาะที่ไม่มี VAT</option>
        </select>
        {stoppedCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
            <input
              type="checkbox"
              checked={hideStopped}
              onChange={(e) => { setHideStopped(e.target.checked); setShown(PAGE) }}
              className="w-4 h-4 accent-blue-600"
            />
            ซ่อนที่งดจำหน่าย ({count(stoppedCount)})
          </label>
        )}
        <p className="text-sm text-gray-500 shrink-0">
          {/* ตัวกรอง VAT กับ "ซ่อนที่งดจำหน่าย" ก็ต้องนับใหม่ ไม่ใช่โชว์ยอดเต็มค้างไว้จนดูเหมือนกรองไม่ติด */}
          {query || vatFilter || hideStopped ? (
            <>
              พบ <span className="font-semibold text-gray-900">{count(found.length)}</span> จาก{' '}
              {count(products.length)} รายการ
            </>
          ) : (
            <>ทั้งหมด {count(products.length)} รายการ</>
          )}
        </p>
      </div>

      {picked.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
          <Receipt size={15} className="text-blue-600 shrink-0" />
          <span className="text-sm font-medium text-blue-900">
            เลือกไว้ {count(picked.size)} รายการ
          </span>
          {picked.size < found.length && (
            <button
              onClick={() => setPicked(new Set(found.map((p) => p.id)))}
              className="text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
            >
              เลือกทั้งหมดที่ค้นเจอ ({count(found.length)})
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => applyVat(true)}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              ตั้งเป็น มี VAT
            </button>
            <button
              onClick={() => applyVat(false)}
              disabled={saving}
              className="rounded-lg bg-gray-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40"
            >
              ตั้งเป็น ไม่มี VAT
            </button>
            <button
              onClick={() => applyVat(null)}
              disabled={saving}
              title="ลบค่าที่ตั้งรายตัว ให้ใช้ค่าของหมวดหมู่แทน"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              ใช้ตามหมวดหมู่
            </button>
            <button
              onClick={() => setPicked(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              ล้างการเลือก
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="pl-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allVisiblePicked}
                  onChange={() => {
                    const next = new Set(picked)
                    if (allVisiblePicked) visible.forEach((p) => next.delete(p.id))
                    else visible.forEach((p) => next.add(p.id))
                    setPicked(next)
                  }}
                  aria-label="เลือกทั้งหมดในหน้านี้"
                  className="w-4 h-4 accent-blue-600"
                />
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สินค้า</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">SKU</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">บาร์โค้ด</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">หมวด</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ราคา</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">คงเหลือ</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">งดจำหน่าย</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">ขายออนไลน์</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                selected={picked.has(product.id)}
                onToggle={() => toggleOne(product.id)}
              />
            ))}
            {found.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">
                  {products.length === 0
                    ? 'ยังไม่มีสินค้า — กด "เพิ่มสินค้า" เพื่อเริ่มต้น'
                    : `ไม่เจอสินค้าที่ตรงกับ "${query}"`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {found.length > visible.length && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setShown(shown + PAGE)}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg"
          >
            แสดงเพิ่ม {count(Math.min(PAGE, found.length - visible.length))} รายการ
          </button>
          <button
            onClick={() => setShown(found.length)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            แสดงทั้งหมด ({count(found.length)})
          </button>
        </div>
      )}
      {found.length > PAGE && found.length === visible.length && (
        <p className="text-center text-xs text-gray-400 mt-4">แสดงครบ {count(found.length)} รายการแล้ว</p>
      )}
    </>
  )
}
