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

/** แถวในตารางสินค้า — ใช้บนจอกว้างเท่านั้น จอเล็กใช้ ProductCard แทน */
export default function ProductRow({
  product, selected, onToggle,
}: {
  product: Product
  selected: boolean
  onToggle: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const stock = stockOf(product)

  return (
    <>
      <tr className={`hover:bg-gray-50 ${product.active ? '' : 'opacity-60'} ${selected ? 'bg-blue-50/60' : ''}`}>
        <td className="pl-4 py-3 w-8">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`เลือก ${product.name}`}
            className="w-4 h-4 accent-blue-600"
          />
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-left w-full"
          >
            {expanded ? (
              <ChevronDown size={14} className="text-gray-400 shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-gray-400 shrink-0" />
            )}
            <ProductThumb product={product} />
            <div>
              <p className="text-sm font-medium text-gray-900 hover:text-blue-600">{product.name}</p>
              <ProductMeta product={product} />
            </div>
          </button>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 font-mono">
          {product.sku || '—'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 font-mono">
          {product.barcode || '—'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">
          {product.categories?.name || '—'}
        </td>
        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
          <PriceLines product={product} />
        </td>
        <td className="px-4 py-3 text-sm text-right">
          <span className={stock.low ? 'text-red-600 font-semibold' : 'text-gray-700'}>
            {stock.total} {product.unit}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <StopSellingToggle product={product} />
        </td>
        <td className="px-4 py-3 text-center">
          <OnlineToggle product={product} clinicOnly={isClinicOnly(product)} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 justify-end">
            <Link
              href={`/admin/products/${product.id}`}
              className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
            >
              <Edit size={15} />
            </Link>
            <DeleteProductButton id={product.id} name={product.name} />
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/60">
          <td colSpan={10} className="px-4 py-3">
            <LotList product={product} />
          </td>
        </tr>
      )}
    </>
  )
}
