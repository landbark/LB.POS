'use client'

import { useState } from 'react'
import PrintToolbar from '@/components/PrintToolbar'
import type { StoreSettings, PromotionType, ApplyTo } from '@/lib/types'

interface PromotionDoc {
  id: string
  name: string
  type: PromotionType
  discount_percent: number | null
  buy_quantity: number | null
  get_quantity: number | null
  apply_to: ApplyTo
  start_date: string
  end_date: string
  categories: { name: string } | null
  products: { name: string; unit: string; price: number } | null
}

// ป้ายโปรโมชั่นพิมพ์แนวนอนอย่างเดียว (A5 = ป้ายตั้งโต๊ะ/ติดชั้น, A4 = ป้ายใหญ่หน้าร้าน)
type PaperSize = 'a5' | 'a4'

const PAPER_CONFIG: Record<PaperSize, { page: string; margin: string; width: string; height: string; scale: number }> = {
  a5: { page: 'A5 landscape', margin: '7mm', width: '196mm', height: '134mm', scale: 1 },
  a4: { page: 'A4 landscape', margin: '10mm', width: '277mm', height: '190mm', scale: 1.42 },
}

const BROWN = '#7A4E2D'
const COPPER = '#C4865A'
const CREAM = '#FDF6EE'

const thaiDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })

export default function PromotionPrintView({ promotion: p, store }: { promotion: PromotionDoc; store: StoreSettings | null }) {
  const [size, setSize] = useState<PaperSize>('a5')
  const cfg = PAPER_CONFIG[size]
  const em = (n: number) => `${(n * cfg.scale).toFixed(2)}rem`

  const isPercent = p.type === 'percent_discount'
  const scope = p.apply_to === 'all'
    ? 'ทุกสินค้าในร้าน'
    : p.apply_to === 'category'
      ? `เฉพาะหมวด ${p.categories?.name ?? '—'}`
      : `เฉพาะ ${p.products?.name ?? '—'}`

  // ลด % ของสินค้าชิ้นเดียว = คำนวณราคาหลังลดให้ลูกค้าเห็นบนป้ายได้เลย
  const salePrice = isPercent && p.products && p.discount_percent
    ? p.products.price * (1 - p.discount_percent / 100)
    : null

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @page { size: ${cfg.page}; margin: ${cfg.margin}; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          /* ไม่งั้นเบราว์เซอร์จะตัดพื้นหลังสี/กรอบออกตอนพิมพ์ ป้ายจะกลายเป็นขาวล้วน */
          .promo-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: none !important; }
        }
      `}</style>

      <PrintToolbar
        backHref="/admin/promotions"
        size={size}
        onSizeChange={(v) => setSize(v as PaperSize)}
        sizes={[
          { value: 'a5', label: 'A5 แนวนอน' },
          { value: 'a4', label: 'A4 แนวนอน' },
        ]}
      />

      <div className="flex justify-center py-6 print:py-0">
        <div
          className="promo-sheet bg-white shadow-lg flex flex-col text-center"
          style={{
            width: cfg.width,
            height: cfg.height,
            maxWidth: '100%',
            background: CREAM,
            border: `${(0.28 * cfg.scale).toFixed(2)}rem solid ${COPPER}`,
            padding: `${(1.1 * cfg.scale).toFixed(2)}rem ${(1.6 * cfg.scale).toFixed(2)}rem`,
          }}
        >
          {/* หัวร้าน */}
          <div className="flex items-center justify-center gap-2 shrink-0" style={{ color: BROWN }}>
            {store?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt="" style={{ height: em(1.6), width: em(1.6), objectFit: 'contain' }} />
            )}
            <span className="font-bold tracking-wide" style={{ fontSize: em(0.95) }}>{store?.name ?? 'LANDBARK'}</span>
          </div>

          {/* เนื้อป้าย — ตัวเลขส่วนลดต้องเด่นที่สุด อ่านออกจากระยะไกล */}
          <div className="flex-1 flex flex-col items-center justify-center" style={{ gap: em(0.55) }}>
            {/* line-height เผื่อไว้เสมอ — ตัวไทยมีสระบน/วรรณยุกต์ ถ้า leading แน่นไปหัวจะโดนตัด */}
            <p className="font-semibold" style={{ fontSize: em(1.35), color: BROWN, lineHeight: 1.35 }}>{p.name}</p>

            {isPercent ? (
              <p className="font-black" style={{ fontSize: em(5), color: COPPER, lineHeight: 1.15 }}>
                ลด {p.discount_percent}%
              </p>
            ) : (
              <p className="font-black" style={{ fontSize: em(3.4), color: COPPER, lineHeight: 1.15 }}>
                ซื้อ {p.buy_quantity} แถม {p.get_quantity}
              </p>
            )}

            <p className="font-medium" style={{ fontSize: em(1.05), color: BROWN }}>{scope}</p>

            {salePrice !== null && p.products && (
              <p style={{ fontSize: em(1.15), color: BROWN }}>
                จาก <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>฿{p.products.price.toLocaleString('th-TH')}</span>
                {' '}เหลือ{' '}
                <span className="font-bold" style={{ fontSize: em(1.5), color: COPPER }}>
                  ฿{salePrice.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(salePrice) ? 0 : 2, maximumFractionDigits: 2 })}
                </span>
                <span style={{ fontSize: em(0.85) }}> /{p.products.unit}</span>
              </p>
            )}
          </div>

          {/* ช่วงเวลา */}
          <div
            className="shrink-0 rounded-full font-medium"
            style={{
              fontSize: em(0.9),
              color: CREAM,
              background: BROWN,
              padding: `${em(0.3)} ${em(0.9)}`,
              alignSelf: 'center',
            }}
          >
            {p.start_date === p.end_date
              ? `เฉพาะวันที่ ${thaiDate(p.start_date)}`
              : `${thaiDate(p.start_date)} – ${thaiDate(p.end_date)}`}
          </div>
        </div>
      </div>
    </div>
  )
}
