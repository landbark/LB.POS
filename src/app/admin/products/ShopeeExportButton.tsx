'use client'

import { Store } from 'lucide-react'
import toast from 'react-hot-toast'
import { downloadCsv } from '@/lib/csv'

interface ShopeeProduct {
  sku: string | null
  name: string
  barcode: string | null
  price: number
  unit: string
  on_shopee: boolean
  is_service: boolean
  product_lots?: { quantity: number }[] | null
}

const stockOf = (p: ShopeeProduct) =>
  p.is_service ? '' : String((p.product_lots ?? []).reduce((s, l) => s + l.quantity, 0))

/**
 * ออกไฟล์รายการสินค้าที่ติดธง Shopee ไว้ เอาไปกรอกลงเทมเพลต Mass Update ของ Shopee เอง
 *
 * ไม่ได้ทำเป็นไฟล์ที่อัปเข้า Shopee ได้ตรงๆ เพราะเทมเพลตของ Shopee เปลี่ยนตามหมวดสินค้า
 * และต้องมีรหัสสินค้าฝั่ง Shopee ที่ระบบเรายังไม่มี — ไฟล์นี้ให้ข้อมูลฝั่งเราที่ครบและตรงเวลา
 */
export default function ShopeeExportButton({ products }: { products: ShopeeProduct[] }) {
  const flagged = products.filter((p) => p.on_shopee)

  function handleClick() {
    if (flagged.length === 0) {
      toast.error('ยังไม่มีสินค้าที่ติดธง Shopee — ติ๊ก "ลงขายบน Shopee แล้ว" ที่สินค้าก่อน')
      return
    }
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    downloadCsv(
      [
        ['SKU', 'ชื่อสินค้า', 'บาร์โค้ด', 'ราคาขาย', 'สต็อคคงเหลือ', 'หน่วย'],
        ...flagged.map((p) => [
          p.sku ?? '',
          p.name,
          p.barcode ?? '',
          String(p.price),
          stockOf(p),
          p.unit,
        ]),
      ],
      `landbark-shopee-${today}.csv`,
    )
    toast.success(`ออกไฟล์ ${flagged.length} รายการแล้ว`)
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
      title="ออกไฟล์สินค้าที่ลงขาย Shopee ไว้ (ราคา + สต็อคล่าสุด)"
    >
      <Store size={15} /> ไฟล์ Shopee
      <span className="text-xs text-gray-400">{flagged.length}</span>
    </button>
  )
}
