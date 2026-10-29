import type { StoreSettings } from '@/lib/types'
import { CHANNEL_LABEL, isOnlineChannel, platformPaymentLabel } from '@/lib/salesChannel'
import { paymentLines } from '@/lib/payments'
import { bahtText } from '@/lib/bahtText'
import { PAYMENT_LABELS, money, type ReceiptTx } from './receipt-shared'

// ใบเสร็จเต็มรูปแบบสำหรับ A4/A5 — คนละแบบกับสลิป 80mm หน้าเคาน์เตอร์
//
// สลิปความร้อนมีที่แคบ อ่านแบบไล่บรรทัดบนลงล่าง แต่ใบ A4/A5 เอาไว้ส่งลูกค้าองค์กร
// แนบเบิก หรือเก็บเข้าแฟ้ม จึงต้องเป็นเอกสารจริง: มีตารางรายการเป็นคอลัมน์
// มียอดเป็นตัวอักษรกันแก้ย้อนหลัง และมีช่องเซ็นรับเงิน
//
// จงใจไม่มีส่วน VAT/ใบกำกับภาษี — ร้านยังไม่ได้จดทะเบียน VAT และ POS ก็ไม่ได้
// บวก VAT เข้าราคาขาย (ดู src/lib/vat.ts) ออกใบกำกับภาษีทั้งที่ยังไม่จดผิดกฎหมาย
export default function ReceiptDocument({ tx, store }: { tx: ReceiptTx; store: StoreSettings | null }) {
  const splitLines = paymentLines(tx)
  const paidAt = new Date(tx.created_at)
  // ไม่มีส่วนลดสักรายการก็ตัดคอลัมน์ทิ้ง — A5 แคบ ทุกคอลัมน์ที่ตัดได้ช่วยให้อ่านง่ายขึ้น
  const hasItemDiscount = tx.transaction_items.some((it) => it.discount > 0)
  const isCash = tx.payment_method === 'cash' || splitLines.some((l) => l.method === 'cash')

  return (
    <>
      {tx.status === 'cancelled' && (
        <p className="text-center font-bold text-red-600 border-2 border-red-500 rounded py-1.5 mb-4" style={{ fontSize: '1.1em' }}>
          ใบเสร็จนี้ถูกยกเลิกแล้ว
        </p>
      )}

      {/* หัวเอกสาร — ร้านซ้าย ชื่อเอกสารขวา แบบเดียวกับใบสั่งซื้อ */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          {store?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logo_url} alt={store.name} className="h-14 w-14 object-contain shrink-0" />
          )}
          <div>
            <p className="font-bold" style={{ fontSize: '1.2em' }}>{store?.name ?? 'LANDBARK'}</p>
            {store?.address && <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.85em' }}>{store.address}</p>}
            <p className="text-gray-600" style={{ fontSize: '0.85em' }}>
              {[store?.phone && `โทร ${store.phone}`, store?.tax_id && `เลขผู้เสียภาษี ${store.tax_id}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold" style={{ fontSize: '1.3em' }}>ใบเสร็จรับเงิน</p>
          <p className="text-gray-500" style={{ fontSize: '0.85em' }}>Receipt</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6" style={{ fontSize: '0.9em' }}>
        <div>
          <p className="text-gray-500 mb-0.5">ลูกค้า</p>
          <p className="font-medium">{tx.customers?.name ?? 'ลูกค้าทั่วไป'}</p>
          {tx.customers?.hn && <p className="text-gray-600">HN {tx.customers.hn}</p>}
          {tx.customers?.phone && <p className="text-gray-600">โทร {tx.customers.phone}</p>}
        </div>
        <div className="text-right">
          <p><span className="text-gray-500">เลขที่</span> <span className="font-mono">{tx.transaction_number}</span></p>
          <p><span className="text-gray-500">วันที่</span> {paidAt.toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
          <p><span className="text-gray-500">เวลา</span> {paidAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</p>
          {tx.profiles?.name && <p><span className="text-gray-500">พนักงาน</span> {tx.profiles.name}</p>}
          {tx.sales_channel && isOnlineChannel(tx.sales_channel) && (
            <p>
              <span className="text-gray-500">ช่องทาง</span> {CHANNEL_LABEL[tx.sales_channel]}
              {tx.external_order_no && <span className="font-mono"> · {tx.external_order_no}</span>}
            </p>
          )}
        </div>
      </div>

      {/* คอลัมน์เป็นเปอร์เซ็นต์ ไม่ใช่ px ตายตัว — A5 แคบกว่า A4 เกือบ 200px
          ถ้าตรึงความกว้างไว้ ช่องชื่อสินค้าบน A5 จะเหลือไม่ถึง 100px แล้วชื่อแตกเป็นสิบบรรทัด */}
      <table className="w-full border-collapse mb-5 table-fixed" style={{ fontSize: '0.9em' }}>
        <colgroup>
          <col style={{ width: '5%' }} />
          <col />
          <col style={{ width: '14%' }} />
          <col style={{ width: '15%' }} />
          {hasItemDiscount && <col style={{ width: '13%' }} />}
          <col style={{ width: '17%' }} />
        </colgroup>
        <thead>
          <tr className="border-b-2 border-gray-800 text-left">
            <th className="py-2 pr-2 text-center">#</th>
            <th className="py-2 pr-2">รายการ</th>
            <th className="py-2 pr-2 text-right">จำนวน</th>
            <th className="py-2 pr-2 text-right">ราคา/หน่วย</th>
            {hasItemDiscount && <th className="py-2 pr-2 text-right">ส่วนลด</th>}
            <th className="py-2 text-right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {tx.transaction_items.map((it, i) => (
            <tr key={i} className="border-b border-gray-200 align-top">
              <td className="py-2 pr-2 text-center text-gray-500">{i + 1}</td>
              <td className="py-2 pr-2">
                {it.products?.name ?? 'สินค้า'}
                {it.products?.sku && <span className="text-gray-400 font-mono"> ({it.products.sku})</span>}
              </td>
              <td className="py-2 pr-2 text-right">
                {it.quantity} {it.unit_name ?? it.products?.unit ?? ''}
                {/* ขายยกกล่อง/ยกลัง — กำกับไว้ว่าได้ของไปกี่หน่วยย่อย */}
                {it.unit_factor > 1 && (
                  <span className="block text-[11px] text-gray-500">
                    = {it.base_quantity} {it.products?.unit ?? ''}
                  </span>
                )}
              </td>
              <td className="py-2 pr-2 text-right">{money(it.unit_price)}</td>
              {hasItemDiscount && (
                <td className="py-2 pr-2 text-right">{it.discount > 0 ? `-${money(it.discount)}` : '—'}</td>
              )}
              <td className="py-2 text-right">{money(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mb-4">
        <div className="w-64 space-y-1" style={{ fontSize: '0.9em' }}>
          <div className="flex justify-between"><span className="text-gray-500">ยอดรวม</span><span>{money(tx.subtotal)}</span></div>
          {tx.discount > 0 && (
            <div className="flex justify-between"><span className="text-gray-500">ส่วนลด</span><span>-{money(tx.discount)}</span></div>
          )}
          {tx.credit_used > 0 && (
            <div className="flex justify-between"><span className="text-gray-500">ใช้เครดิต</span><span>-{money(tx.credit_used)}</span></div>
          )}
          {!!tx.rounding && tx.rounding !== 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">ปัดเศษ</span>
              <span>{tx.rounding > 0 ? '+' : '-'}{money(Math.abs(tx.rounding))}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t-2 border-gray-800 pt-2 mt-1" style={{ fontSize: '1.05em' }}>
            <span>ยอดสุทธิ</span><span>฿{money(tx.total)}</span>
          </div>
        </div>
      </div>

      {/* ยอดเป็นตัวอักษร — ธรรมเนียมเอกสารการเงินไทย กันแก้ตัวเลขย้อนหลัง */}
      <div className="border-y border-gray-300 py-2 mb-5 text-center" style={{ fontSize: '0.9em' }}>
        <span className="text-gray-500">ตัวอักษร</span> <span className="font-medium">({bahtText(tx.total)})</span>
      </div>

      <div className="mb-8" style={{ fontSize: '0.9em' }}>
        <p className="text-gray-500 mb-1">การชำระเงิน</p>
        {splitLines.length > 1 ? (
          <div className="space-y-0.5">
            {splitLines.map((l) => (
              <div key={l.method} className="flex justify-between w-64">
                <span>· {PAYMENT_LABELS[l.method]}</span>
                <span>{money(l.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          /* ขายผ่านแพลตฟอร์มเก็บเป็นโอนเงินไว้ในคอลัมน์เดิม — บนใบเสร็จต้องบอกตามจริงว่าเก็บเงินทางไหน */
          <p className="font-medium">{platformPaymentLabel(tx.sales_channel) ?? PAYMENT_LABELS[tx.payment_method]}</p>
        )}

        {isCash && tx.cash_received != null && (
          <div className="mt-1 space-y-0.5 text-gray-600">
            <div className="flex justify-between w-64"><span>รับเงิน</span><span>{money(tx.cash_received)}</span></div>
            <div className="flex justify-between w-64"><span>เงินทอน</span><span>{money(tx.change_given ?? 0)}</span></div>
          </div>
        )}

        {(tx.points_earned > 0 || tx.points_used > 0) && (
          <p className="mt-2 text-gray-500">
            แต้มสะสม
            {tx.points_used > 0 && ` · ใช้ไป ${tx.points_used} แต้ม`}
            {tx.points_earned > 0 && ` · ได้รับ ${tx.points_earned} แต้ม`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-8 pt-6" style={{ fontSize: '0.9em' }}>
        <div>
          <div className="border-b border-gray-400 h-10" />
          <p className="text-center text-gray-500 mt-1">ผู้จ่ายเงิน</p>
        </div>
        <div>
          <div className="border-b border-gray-400 h-10" />
          <p className="text-center text-gray-500 mt-1">ผู้รับเงิน</p>
        </div>
      </div>
    </>
  )
}
