import { isClinicOnly } from '@/lib/clinic'
import { isVatApplicable } from '@/lib/vat'
import { hasBoothPrice } from '@/lib/booth'
import { formatWeight } from '@/lib/shop'
import type { Product } from '@/lib/types'

/**
 * ชิ้นส่วนที่แถวตาราง (จอใหญ่) กับการ์ด (จอเล็ก) ใช้ร่วมกัน
 *
 * แยกออกมาเพราะสองหน้าตานี้ต้องบอกเรื่องเดียวกันเสมอ — ถ้าก๊อปโค้ดไว้สองที่
 * เพิ่มป้ายใหม่ทีหนึ่งแล้วลืมแก้อีกฝั่ง คนดูบนมือถือจะเห็นข้อมูลไม่ครบ
 */

const baht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

/** รูปสินค้า หรือรอยเท้าแทนเมื่อยังไม่ได้ใส่รูป */
export function ProductThumb({ product, size = 'w-10 h-10' }: { product: Product; size?: string }) {
  if (product.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.image_url}
        alt={product.name}
        loading="lazy"
        className={`${size} rounded-lg object-cover border border-gray-100 shrink-0`}
      />
    )
  }
  return (
    <div className={`${size} rounded-lg bg-gray-100 flex items-center justify-center text-base shrink-0`}>
      🐾
    </div>
  )
}

/** บรรทัดหน่วย + ป้ายกำกับใต้ชื่อสินค้า */
export function ProductMeta({ product }: { product: Product }) {
  const clinicOnly = isClinicOnly(product)
  return (
    <p className="text-xs text-gray-500">
      {product.unit}
      {!product.active && <span className="ml-1.5 font-medium text-red-600">· งดจำหน่าย</span>}
      {isVatApplicable(product) && <span className="ml-1.5 text-indigo-600">· VAT</span>}
      {clinicOnly && <span className="ml-1.5 text-amber-600">· ของคลินิก</span>}
      {product.is_service && <span className="ml-1.5 text-gray-400">· บริการ</span>}
      {product.on_shopee && <span className="ml-1.5 text-orange-600">· Shopee</span>}
      {!product.is_service && !clinicOnly && (
        product.weight_grams != null
          ? <span className="ml-1.5 text-gray-400">· {formatWeight(product.weight_grams)}</span>
          : <span className="ml-1.5 text-amber-600">· ยังไม่ใส่น้ำหนัก</span>
      )}
    </p>
  )
}

/** ราคาขาย + ราคาบูธ + ราคาของหน่วยใหญ่ที่ผูกไว้ */
export function PriceLines({ product }: { product: Product }) {
  return (
    <>
      ฿{baht(product.price)}
      {hasBoothPrice(product) && (
        <span className="block text-xs font-normal text-amber-700" title="ราคาตอนออกบูธ">
          บูธ ฿{baht(product.booth_price!)}
        </span>
      )}
      {/* หน่วยใหญ่ที่ผูกไว้ — ปิดโชว์หน้าขายจะขึ้นวงเล็บกำกับว่าใช้สั่งของเท่านั้น */}
      {(product.product_units ?? [])
        .filter((u) => u.active)
        .sort((a, b) => a.factor - b.factor)
        .map((u) => (
          <span key={u.id} className="block text-xs font-normal text-gray-500">
            {u.unit_name} ({u.factor}) ฿{baht(u.price ?? product.price * u.factor)}
            {!u.sellable_pos && ' · สั่งของ'}
          </span>
        ))}
    </>
  )
}

/** รายการ lot ที่กางออกมาเมื่อกดชื่อสินค้า */
export function LotList({ product }: { product: Product }) {
  const lots = product.product_lots ?? []
  if (lots.length === 0) return <p className="text-sm text-gray-400 py-1">ยังไม่มี lot</p>

  const today = new Date().toISOString().split('T')[0]
  // เส้นแบ่ง "ใกล้หมดอายุ" คิดครั้งเดียวจาก today — ไม่ใช่คิดใหม่ทุก lot
  const expiringSoonCutoff = new Date(Date.parse(today) + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  return (
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
            lot.expiry_date <= expiringSoonCutoff
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
  )
}

/** คงเหลือรวมทุก lot + ธงว่าต่ำกว่าจุดสั่งซื้อหรือยัง */
export function stockOf(product: Product) {
  const total = (product.product_lots ?? []).reduce((sum, lot) => sum + (lot.quantity ?? 0), 0)
  return { total, low: !product.is_service && total <= product.min_stock }
}
