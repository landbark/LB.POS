'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Edit } from 'lucide-react'
import DeleteProductButton from './DeleteProductButton'
import OnlineToggle from './OnlineToggle'
import StopSellingToggle from './StopSellingToggle'
import { ProductThumb, ProductMeta, PriceLines, LotList, stockOf } from './ProductBits'
import { isClinicOnly } from '@/lib/clinic'
import type { Product } from '@/lib/types'

/**
 * สินค้าหนึ่งตัวบนจอเล็ก
 *
 * ตารางสิบคอลัมน์ลงมือถือไม่ไหว — บีบจนชื่อสินค้าแตกเป็นคำละบรรทัด ส่วนที่เหลือหลุดขอบไป
 * การ์ดวางของสำคัญ (ชื่อ-ราคา-คงเหลือ) ไว้บนสุด แล้วยัดบาร์โค้ด/หมวดลงบรรทัดรองแทน
 */
export default function ProductCard({
  product, selected, onToggle,
}: {
  product: Product
  selected: boolean
  onToggle: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const clinicOnly = isClinicOnly(product)
  const stock = stockOf(product)

  return (
    <div
      className={`rounded-xl border bg-white p-3 shadow-sm ${
        selected ? 'border-blue-300 bg-blue-50/50' : 'border-gray-100'
      } ${product.active ? '' : 'opacity-60'}`}
    >
      <div className="flex gap-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`เลือก ${product.name}`}
          className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
        />
        <ProductThumb product={product} size="w-12 h-12" />
        {/* min-w-0 กันชื่อยาวดันการ์ดจนล้นจอ ให้ตัดบรรทัดในกรอบของมันเอง */}
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/products/${product.id}`}
            className="block text-sm font-medium leading-snug text-gray-900"
          >
            {product.name}
          </Link>
          <ProductMeta product={product} />
        </div>
      </div>

      {/* ราคาลงมาอยู่บรรทัดนี้ ไม่ใช่คอลัมน์ขวาของชื่อ — ชื่อสินค้าที่นี่ยาวเป็นบรรทัดๆ
          ถ้าแบ่งความกว้างให้ราคาด้วย ชื่อจะเหลือที่แคบจนแตกเป็นคำละบรรทัด */}
      <div className="mt-2.5 flex items-start justify-between gap-3 border-t border-gray-100 pt-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span className="font-mono">{product.sku || '—'}</span>
          {product.barcode && <span className="font-mono">{product.barcode}</span>}
          {product.categories?.name && <span>{product.categories.name}</span>}
          <span className={stock.low ? 'font-semibold text-red-600' : 'text-gray-700'}>
            คงเหลือ {stock.total} {product.unit}
          </span>
        </div>
        <div className="shrink-0 text-right text-sm font-medium text-gray-900">
          <PriceLines product={product} />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 border-t border-gray-100 pt-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <StopSellingToggle product={product} />
          งดจำหน่าย
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <OnlineToggle product={product} clinicOnly={clinicOnly} />
          ขายออนไลน์
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 rounded p-1.5 text-xs text-gray-500"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            lot
          </button>
          <Link
            href={`/admin/products/${product.id}`}
            aria-label={`แก้ไข ${product.name}`}
            className="rounded p-1.5 text-gray-400"
          >
            <Edit size={15} />
          </Link>
          <DeleteProductButton id={product.id} name={product.name} />
        </div>
      </div>

      {expanded && (
        <div className="mt-2 overflow-x-auto border-t border-gray-100 pt-2">
          <LotList product={product} />
        </div>
      )}
    </div>
  )
}
