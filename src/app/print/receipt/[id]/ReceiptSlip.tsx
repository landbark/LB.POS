import type { StoreSettings } from '@/lib/types'
import { CHANNEL_LABEL, isOnlineChannel, platformPaymentLabel } from '@/lib/salesChannel'
import { paymentLines } from '@/lib/payments'
import { PAYMENT_LABELS, money, type ReceiptTx } from './receipt-shared'

// สลิป 80mm สำหรับเครื่องพิมพ์ความร้อนหน้าเคาน์เตอร์ — ที่แคบ อ่านไล่บรรทัดบนลงล่าง
// ใบเต็มรูปแบบสำหรับ A4/A5 อยู่ที่ ReceiptDocument.tsx
export default function ReceiptSlip({ tx, store }: { tx: ReceiptTx; store: StoreSettings | null }) {
  // บิลที่จ่ายทางเดียวได้มาแถวเดียว — ใบเสร็จจะพิมพ์บรรทัด "ชำระโดย" แบบเดิม
  const splitLines = paymentLines(tx)

  return (
    <>
      {tx.status === 'cancelled' && (
        <p className="text-center font-bold text-red-600 border-2 border-red-500 rounded py-1 mb-3" style={{ fontSize: '1.1em' }}>
          ใบเสร็จนี้ถูกยกเลิกแล้ว
        </p>
      )}

      {/* หัวร้าน */}
      <div className="text-center mb-3">
        {store?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logo_url} alt={store.name} className="mx-auto mb-1 h-14 w-14 object-contain" />
        )}
        <p className="font-bold" style={{ fontSize: '1.15em' }}>{store?.name ?? 'LANDBARK'}</p>
        {store?.address && <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.85em' }}>{store.address}</p>}
        {store?.phone && <p className="text-gray-600" style={{ fontSize: '0.85em' }}>โทร {store.phone}</p>}
        {store?.tax_id && <p className="text-gray-600" style={{ fontSize: '0.85em' }}>เลขผู้เสียภาษี {store.tax_id}</p>}
      </div>

      <div className="border-t border-dashed border-gray-400 my-2" />

      <p className="font-semibold text-center mb-2">ใบเสร็จรับเงิน</p>
      <div className="space-y-0.5 mb-2" style={{ fontSize: '0.9em' }}>
        <div className="flex justify-between"><span>เลขที่</span><span className="font-mono">{tx.transaction_number}</span></div>
        <div className="flex justify-between">
          <span>วันที่</span>
          <span>{new Date(tx.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
        {/* บิลที่คีย์ตามหลัง — บอกไว้บนใบเสร็จด้วย ไม่งั้นลูกค้าเทียบวันกับเวลาที่ได้รับใบไม่ตรง */}
        {tx.recorded_at && (
          <div className="flex justify-between">
            <span>บันทึกย้อนหลัง</span>
            <span>{new Date(tx.recorded_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
        )}
        {tx.profiles?.name && <div className="flex justify-between"><span>พนักงาน</span><span>{tx.profiles.name}</span></div>}
        {tx.customers && <div className="flex justify-between"><span>ลูกค้า</span><span>{tx.customers.name}</span></div>}
      </div>

      <div className="border-t border-dashed border-gray-400 my-2" />

      {/* รายการสินค้า */}
      <div className="space-y-1.5 mb-2">
        {tx.transaction_items.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between font-medium">
              <span>{item.products?.name ?? 'สินค้า'}</span>
              <span>{money(item.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500" style={{ fontSize: '0.85em' }}>
              <span>
                {item.quantity} {item.unit_name ?? item.products?.unit ?? ''} x {money(item.unit_price)}
                {/* ขายยกกล่อง/ยกลัง — กำกับไว้ว่าได้ของไปกี่หน่วยย่อย */}
                {item.unit_factor > 1 && ` (${item.base_quantity} ${item.products?.unit ?? ''})`}
              </span>
              {item.discount > 0 && <span>ลด {money(item.discount)}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-gray-400 my-2" />

      {/* สรุปยอด */}
      <div className="space-y-0.5" style={{ fontSize: '0.9em' }}>
        <div className="flex justify-between"><span>ยอดรวม</span><span>{money(tx.subtotal)}</span></div>
        {tx.discount > 0 && <div className="flex justify-between"><span>ส่วนลด</span><span>-{money(tx.discount)}</span></div>}
        {tx.credit_used > 0 && <div className="flex justify-between"><span>ใช้เครดิต</span><span>-{money(tx.credit_used)}</span></div>}
        {!!tx.rounding && tx.rounding !== 0 && (
          <div className="flex justify-between"><span>ปัดเศษ</span><span>{tx.rounding > 0 ? '+' : '-'}{money(Math.abs(tx.rounding))}</span></div>
        )}
        <div className="flex justify-between font-bold border-t border-gray-300 pt-1 mt-1" style={{ fontSize: '1.05em' }}>
          <span>ยอดสุทธิ</span><span>{money(tx.total)}</span>
        </div>
        {splitLines.length > 1 ? (
          <>
            <div className="pt-1">ชำระโดย</div>
            {splitLines.map((l) => (
              <div key={l.method} className="flex justify-between">
                <span className="pl-2">· {PAYMENT_LABELS[l.method]}</span>
                <span>{money(l.amount)}</span>
              </div>
            ))}
          </>
        ) : (
          /* ขายผ่านแพลตฟอร์มเก็บเป็นโอนเงินไว้ในคอลัมน์เดิม — บนใบเสร็จต้องบอกตามจริงว่าเก็บเงินทางไหน */
          <div className="flex justify-between pt-1">
            <span>ชำระโดย</span>
            <span>{platformPaymentLabel(tx.sales_channel) ?? PAYMENT_LABELS[tx.payment_method]}</span>
          </div>
        )}
        {tx.sales_channel && isOnlineChannel(tx.sales_channel) && (
          <>
            <div className="flex justify-between"><span>ช่องทาง</span><span>{CHANNEL_LABEL[tx.sales_channel]}</span></div>
            {tx.external_order_no && (
              <div className="flex justify-between"><span>เลขที่ออเดอร์</span><span>{tx.external_order_no}</span></div>
            )}
          </>
        )}
        {(tx.payment_method === 'cash' || splitLines.some((l) => l.method === 'cash')) && tx.cash_received != null && (
          <>
            <div className="flex justify-between"><span>รับเงิน</span><span>{money(tx.cash_received)}</span></div>
            <div className="flex justify-between"><span>เงินทอน</span><span>{money(tx.change_given ?? 0)}</span></div>
          </>
        )}
        {(tx.points_earned > 0 || tx.points_used > 0) && (
          <div className="flex justify-between text-gray-500 pt-1" style={{ fontSize: '0.85em' }}>
            <span>แต้มสะสม</span>
            <span>
              {tx.points_used > 0 && `ใช้ ${tx.points_used} `}
              {tx.points_earned > 0 && `ได้รับ ${tx.points_earned}`}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-dashed border-gray-400 my-2" />
      <p className="text-center text-gray-500" style={{ fontSize: '0.85em' }}>ขอบคุณที่ใช้บริการค่ะ</p>
    </>
  )
}
