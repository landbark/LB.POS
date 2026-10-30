'use client'

import { useState } from 'react'
import PrintToolbar from '@/components/PrintToolbar'
import type { StoreSettings, Promotion } from '@/lib/types'
import { describeCondition } from '@/lib/promotions'

interface ProductRef { id: string; name: string; unit: string; price: number }
interface CategoryRef { id: string; name: string }

// ป้ายโปรโมชั่นพิมพ์แนวนอนอย่างเดียว
// label = สติกเกอร์ 80×50 มม. เท่าฉลากยา (เครื่องพิมพ์ฉลากตัวเดิม) ไว้แปะที่ชั้นวาง/ตัวสินค้า
// a5 = ป้ายตั้งโต๊ะ, a4 = ป้ายใหญ่หน้าร้าน
type PaperSize = 'label' | 'a5' | 'a4'

const PAPER_CONFIG: Record<PaperSize, { page: string; margin: string; width: string; height: string; scale: number }> = {
  label: { page: '80mm 50mm', margin: '0', width: '80mm', height: '50mm', scale: 0.6 },
  a5: { page: 'A5 landscape', margin: '7mm', width: '196mm', height: '134mm', scale: 1 },
  a4: { page: 'A4 landscape', margin: '10mm', width: '277mm', height: '190mm', scale: 1.42 },
}

const BROWN = '#7A4E2D'
const COPPER = '#C4865A'
const CREAM = '#FDF6EE'

const thaiDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
const money = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })

export default function PromotionPrintView({
  promotion: p,
  products,
  categories,
  store,
}: {
  promotion: Promotion
  products: ProductRef[]
  categories: CategoryRef[]
  store: StoreSettings | null
}) {
  const [size, setSize] = useState<PaperSize>('a5')
  // ลิสต์สินค้ายาวๆ บนป้ายไม่มีใครอ่าน — ปกติบอกแค่จำนวน กดติ๊กเองได้ถ้าอยากได้ลิสต์เต็ม
  const [showItems, setShowItems] = useState(false)
  const cfg = PAPER_CONFIG[size]
  const em = (n: number) => `${(n * cfg.scale).toFixed(2)}rem`
  // สติกเกอร์เล็กเท่าฉลากยา — ตัดหัวร้านกับลิสต์สินค้าออก เหลือที่ให้ตัวเลขส่วนลด
  const compact = size === 'label'

  const names = (p.apply_to === 'categories' ? categories : products).map((x) => x.name)
  // เกิน 3 ชื่อขึ้นไปบอกแค่จำนวน — ป้ายที่ยัดชื่อสินค้าเป็นสิบบรรทัดอ่านไม่ออกจากระยะไกล
  const listed = names.length > 0 && names.length <= 3
  const scope = p.apply_to === 'all'
    ? 'ทุกสินค้าในร้าน'
    : names.length === 0
      ? '—'
      : p.apply_to === 'categories'
        ? listed ? `เฉพาะหมวด ${names.join(' · ')}` : `เฉพาะ ${names.length} หมวดที่ร่วมรายการ`
        : listed ? `เฉพาะ ${names.join(' · ')}` : `เฉพาะสินค้าที่ร่วมรายการ ${names.length} รายการ`

  // พาดหัวต้องอ่านออกจากระยะไกล — ตัวเลขส่วนลดคือพระเอก
  const headline = p.type === 'percent_discount'
    ? { text: `ลด ${p.discount_percent}%`, fontSize: 5 }
    : p.type === 'amount_discount'
      ? { text: `ลด ${money(p.discount_amount ?? 0)}.-`, fontSize: 4.2 }
      : { text: `ซื้อ ${p.buy_quantity} แถม ${p.get_quantity}`, fontSize: 3.4 }

  const condition = describeCondition(p)
  // โปรเฉพาะงานออกบูธ — ป้ายต้องบอก ไม่งั้นคนเอาไปตั้งที่ร้านแล้วลูกค้ามาทวงส่วนลด
  const boothOnly = p.channel_scope === 'booth'
  const period = !p.end_date
    ? `ตั้งแต่ ${thaiDate(p.start_date)}`
    : p.start_date === p.end_date
      ? `เฉพาะวันที่ ${thaiDate(p.start_date)}`
      : `${thaiDate(p.start_date)} – ${thaiDate(p.end_date)}`
  const perLabel = p.type === 'amount_discount'
    ? p.amount_mode === 'per_unit' ? 'ต่อชิ้น' : 'ต่อรายการ'
    : null

  // คลุมสินค้าตัวเดียว = คำนวณราคาหลังลดให้ลูกค้าเห็นบนป้ายได้เลย
  const single = products.length === 1 && p.apply_to === 'products' ? products[0] : null
  const savePerUnit = !single
    ? null
    : p.type === 'percent_discount' && p.discount_percent
      ? Math.min(single.price * (p.discount_percent / 100), p.max_discount ?? Infinity)
      : p.type === 'amount_discount' && p.discount_amount && p.amount_mode === 'per_unit'
        ? Math.min(p.discount_amount, single.price)
        : null
  // ป้าย "เหลือ ฿x" ต้องไม่ขึ้นตอนมีเงื่อนไขซื้อครบ ไม่งั้นลูกค้าคิดว่าซื้อชิ้นเดียวก็ได้ราคานี้
  const salePrice = savePerUnit !== null && !condition ? single!.price - savePerUnit : null

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
          { value: 'label', label: 'ฉลาก 80×50 มม.' },
          { value: 'a5', label: 'A5 แนวนอน' },
          { value: 'a4', label: 'A4 แนวนอน' },
        ]}
        extra={
          !listed && names.length > 0 && !compact ? (
            <label className="flex items-center gap-1.5 text-sm text-gray-600 ml-1">
              <input type="checkbox" checked={showItems} onChange={(e) => setShowItems(e.target.checked)} />
              โชว์รายชื่อ{p.apply_to === 'categories' ? 'หมวด' : 'สินค้า'} ({names.length})
            </label>
          ) : null
        }
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
          {/* หัวร้าน — สติกเกอร์เล็กไม่ต้องมี ของแปะอยู่ในร้านอยู่แล้ว */}
          <div
            className="flex items-center justify-center gap-2 shrink-0"
            style={{ color: BROWN, display: compact ? 'none' : undefined }}
          >
            {store?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt="" style={{ height: em(1.6), width: em(1.6), objectFit: 'contain' }} />
            )}
            <span className="font-bold tracking-wide" style={{ fontSize: em(0.95) }}>{store?.name ?? 'LANDBARK'}</span>
          </div>

          {/* เนื้อป้าย — ตัวเลขส่วนลดต้องเด่นที่สุด อ่านออกจากระยะไกล */}
          <div
            className="flex-1 flex flex-col items-center justify-center"
            // กันลิสต์ยาวดันเนื้อหาทะลุกรอบป้ายออกไป — ป้ายสูงคงที่ตามขนาดกระดาษ
            style={{ gap: em(0.45), minHeight: 0, overflow: 'hidden' }}
          >
            {/* line-height เผื่อไว้เสมอ — ตัวไทยมีสระบน/วรรณยุกต์ ถ้า leading แน่นไปหัวจะโดนตัด */}
            <p className="font-semibold" style={{ fontSize: em(1.3), color: BROWN, lineHeight: 1.35 }}>{p.name}</p>

            {condition && (
              <p className="font-semibold" style={{ fontSize: em(1.15), color: BROWN, lineHeight: 1.35 }}>
                {condition}
              </p>
            )}

            <p className="font-black" style={{ fontSize: em(headline.fontSize), color: COPPER, lineHeight: 1.15 }}>
              {headline.text}
            </p>

            {perLabel && (
              <p className="font-medium" style={{ fontSize: em(1), color: BROWN, marginTop: `-${em(0.25)}` }}>
                {perLabel}
              </p>
            )}

            <p className="font-medium" style={{ fontSize: em(1.05), color: BROWN, lineHeight: 1.4 }}>{scope}</p>

            {showItems && !listed && !compact && names.length > 0 && (
              <p style={{ fontSize: em(0.62), color: BROWN, lineHeight: 1.35, opacity: 0.85 }}>
                {names.join(' · ')}
              </p>
            )}

            {salePrice !== null && single && (
              <p style={{ fontSize: em(1.15), color: BROWN }}>
                จาก <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>฿{money(single.price)}</span>
                {' '}เหลือ{' '}
                <span className="font-bold" style={{ fontSize: em(1.5), color: COPPER }}>฿{money(salePrice)}</span>
                <span style={{ fontSize: em(0.85) }}> /{single.unit}</span>
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
            {boothOnly ? `เฉพาะที่งานออกบูธ · ${period}` : period}
          </div>
        </div>
      </div>
    </div>
  )
}
