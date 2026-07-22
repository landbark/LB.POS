'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Edit } from 'lucide-react'
import DeleteProductButton from './DeleteProductButton'
import { isClinicOnly } from '@/lib/clinic'
import type { Product } from '@/lib/types'

export default function ProductRow({ product }: { product: Product }) {
  const [expanded, setExpanded] = useState(false)
  const lots = product.product_lots ?? []
  const totalStock = lots.reduce((sum, lot) => sum + (lot.quantity ?? 0), 0)
  const lowStock = !product.is_service && totalStock <= product.min_stock
  const clinicOnly = isClinicOnly(product)
  const today = new Date().toISOString().split('T')[0]

  return (
    <>
      <tr className="hover:bg-gray-50">
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
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name}
                loading="lazy"
                className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-base shrink-0">
                🐾
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900 hover:text-blue-600">{product.name}</p>
              <p className="text-xs text-gray-500">
                {product.unit}
                {clinicOnly && <span className="ml-1.5 text-amber-600">· ของคลินิก</span>}
                {product.is_service && <span className="ml-1.5 text-gray-400">· บริการ</span>}
              </p>
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
          ฿{product.price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3 text-sm text-right">
          <span className={lowStock ? 'text-red-600 font-semibold' : 'text-gray-700'}>
            {totalStock} {product.unit}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
            product.active
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {product.active ? 'ใช้งาน' : 'ปิด'}
          </span>
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
          <td colSpan={8} className="px-4 py-3">
            {lots.length === 0 ? (
              <p className="text-sm text-gray-400 py-1">ยังไม่มี lot</p>
            ) : (
              <table className="w-full max-w-xl">
                <thead>
                  <tr className="text-xs font-medium text-gray-400 uppercase">
                    <th className="text-left pb-1.5 font-medium">Lot</th>
                    <th className="text-left pb-1.5 font-medium">วันหมดอายุ</th>
                    <th className="text-right pb-1.5 font-medium">คงเหลือ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lots.map((lot) => {
                    const soldOut = lot.quantity === 0
                    const isExpired = !soldOut && lot.expiry_date && lot.expiry_date < today
                    const isExpiringSoon = !soldOut && lot.expiry_date && lot.expiry_date >= today &&
                      lot.expiry_date <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    return (
                      <tr key={lot.id}>
                        <td className="py-1.5 text-sm text-gray-700 font-mono">{lot.lot_number || 'ไม่ระบุ lot'}</td>
                        <td className={`py-1.5 text-sm ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-orange-500' : 'text-gray-500'}`}>
                          {lot.expiry_date ? new Date(lot.expiry_date).toLocaleDateString('th-TH') : 'ไม่มีวันหมดอายุ'}
                          {isExpired && ' ⚠️ หมดแล้ว'}
                          {isExpiringSoon && ' ⚠️ ใกล้หมด'}
                        </td>
                        <td className="py-1.5 text-sm text-right font-semibold text-gray-900">
                          {lot.quantity} {product.unit}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
