'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import generatePayload from 'promptpay-qr'
import { Maximize, Minimize, CheckCircle2 } from 'lucide-react'
import { POS_DISPLAY_CHANNEL, type PosDisplayMessage, type DisplayCustomer } from '@/lib/posDisplay'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

// ขนาดฟอนต์ยอดเงินตัวใหญ่: อิงความสูงจอ (vh) เป็นหลัก แต่ไม่เกินความกว้างกล่อง
// (คิดจากจำนวนตัวอักษร ~0.62em/ตัว) — กันยอดหลักพันขึ้นไป เช่น ฿1,300.00 ล้นกรอบ
function bigMoneyFont(n: number, vh: number, boxInnerVw: number, boxInnerRem: number) {
  const em = 0.62 * (money(n).length + 1) // +1 = สัญลักษณ์ ฿
  return `min(${vh}vh, ${(boxInnerVw / em).toFixed(2)}vw, ${(boxInnerRem / em).toFixed(2)}rem)`
}

// แถวยอดเดิม (ขีดฆ่า) + ส่วนลด — โชว์ตัวเล็กไม่เน้น เหนือยอดสุทธิ เมื่อมีส่วนลด
// props เป็น optional เพราะ message อาจมาจากแท็บหน้าขายที่ยังรันโค้ดเวอร์ชันเก่า (เปิดค้างข้าม deploy)
function DiscountLine({ subtotal, discount }: { subtotal?: number; discount?: number }) {
  if (!subtotal || !discount || discount <= 0) return null
  return (
    <p className="whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 'clamp(0.85rem, 2.2vh, 1.3rem)' }}>
      <span className="line-through">฿{money(subtotal)}</span>
      <span style={{ marginLeft: '0.75em' }}>ส่วนลด −฿{money(discount)}</span>
    </p>
  )
}

// ธีมจอสอง (จอลูกค้า): พื้นน้ำตาลเข้ม ตัวอักษรสว่าง อ่านง่ายในระยะไกล/แสงจ้า
// ขนาดตัวอักษรทั้งหน้าอิง vh (ความสูงจอ) — จอลูกค้ามักเป็นจอเล็ก ต้องใหญ่เต็มพื้นที่เสมอ
const DISPLAY_BG = 'radial-gradient(ellipse at 50% -10%, #4A311F 0%, #2A1B12 55%, #1E130C 100%)'
const TEXT_LIGHT = '#F5E9DA'
const TEXT_MUTED = '#C9A883'

const PAYMENT_TH: Record<string, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน / สแกน QR',
  card: 'บัตรเครดิต',
}

function PointsCard({ customer }: { customer: DisplayCustomer }) {
  return (
    <div className="rounded-2xl" style={{ background: '#F0E4D4', padding: 'clamp(0.75rem, 2.5vh, 1.5rem)' }}>
      <p className="font-medium" style={{ color: '#7A4E2D', fontSize: 'clamp(0.9rem, 2.4vh, 1.4rem)', marginBottom: 'clamp(0.5rem, 1.5vh, 1rem)' }}>
        แต้มสะสมของ {customer.name}
      </p>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="font-bold" style={{ color: '#7A4E2D', fontSize: 'clamp(1.4rem, 4.2vh, 2.6rem)' }}>{customer.pointsBefore.toLocaleString('th-TH')}</p>
          <p className="text-gray-500" style={{ fontSize: 'clamp(0.75rem, 1.9vh, 1.1rem)' }}>แต้มเดิม</p>
        </div>
        <div>
          <p className="font-bold text-green-600" style={{ fontSize: 'clamp(1.4rem, 4.2vh, 2.6rem)' }}>+{customer.pointsEarned.toLocaleString('th-TH')}</p>
          <p className="text-gray-500" style={{ fontSize: 'clamp(0.75rem, 1.9vh, 1.1rem)' }}>ได้รับวันนี้</p>
        </div>
        <div>
          <p className="font-bold" style={{ color: '#C4865A', fontSize: 'clamp(1.4rem, 4.2vh, 2.6rem)' }}>{customer.pointsAfter.toLocaleString('th-TH')}</p>
          <p className="text-gray-500" style={{ fontSize: 'clamp(0.75rem, 1.9vh, 1.1rem)' }}>รวมใหม่</p>
        </div>
      </div>
    </div>
  )
}

interface Props {
  storeName: string
  logoUrl: string | null
  paymentQrUrl: string | null
}

export default function PosDisplayClient({ storeName, logoUrl, paymentQrUrl }: Props) {
  const [msg, setMsg] = useState<PosDisplayMessage | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const channel = new BroadcastChannel(POS_DISPLAY_CHANNEL)
    channel.onmessage = (e: MessageEvent<PosDisplayMessage>) => setMsg(e.data)
    return () => channel.close()
  }, [])

  useEffect(() => {
    function onChange() { setFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // เลื่อนรายการสินค้าไปตัวล่าสุดเสมอ — ลูกค้าจะได้เห็นชิ้นที่เพิ่งสแกนทันที
  const itemCount = msg?.stage === 'cart' ? msg.items.length : 0
  useEffect(() => {
    itemsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [itemCount])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen()
    }
  }

  // ถ้าร้านอัปโหลดรูป QR static ไว้ (เช่น QR ของ K SHOP) ใช้รูปนั้นก่อน — ไม่งั้นค่อย fallback ไปสร้าง QR แบบใส่ยอดอัตโนมัติจาก PromptPay ID
  let qrPayload: string | null = null
  let qrError = false
  if (msg?.stage === 'payment' && msg.method === 'transfer' && !paymentQrUrl && msg.promptpayId) {
    try {
      qrPayload = generatePayload(msg.promptpayId, { amount: msg.total > 0 ? msg.total : undefined })
    } catch {
      qrError = true
    }
  }

  const qrBoxSize = 'min(52vh, 38vw)'

  return (
    <div
      ref={containerRef}
      className="h-screen overflow-hidden flex flex-col"
      style={{ background: DISPLAY_BG }}
    >
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 p-2 rounded-lg hover:bg-white/10 shadow-sm z-10"
        style={{ background: 'rgba(245,233,218,0.1)', color: TEXT_LIGHT }}
        title={fullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'}
      >
        {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>

      <div className="flex items-center justify-center shrink-0" style={{ gap: 'clamp(0.5rem, 1.5vh, 1rem)', paddingTop: 'clamp(0.75rem, 2.5vh, 1.5rem)', paddingBottom: 'clamp(0.25rem, 1vh, 0.75rem)' }}>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={storeName} className="object-contain" style={{ height: 'clamp(2.5rem, 6.5vh, 4rem)', width: 'auto' }} />
        )}
        <h1 className="font-bold tracking-wide" style={{ color: TEXT_LIGHT, fontSize: 'clamp(1.4rem, 4vh, 2.5rem)' }}>{storeName}</h1>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center" style={{ padding: 'clamp(0.75rem, 2.5vh, 2rem) clamp(1rem, 3vw, 3rem)' }}>
        {(!msg || (msg.stage === 'cart' && msg.items.length === 0 && !msg.customer)) && (
          <div className="flex flex-col items-center" style={{ gap: 'clamp(1rem, 3.5vh, 2rem)' }}>
            <div className="relative" style={{ width: 'min(42vh, 32vw)', height: 'min(42vh, 32vw)' }}>
              <div
                className="w-full h-full rounded-full overflow-hidden"
                style={{
                  border: '5px solid #C4865A',
                  boxShadow: '0 0 0 3px rgba(245,233,218,0.18), 0 16px 40px rgba(0,0,0,0.5)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pos-display-welcome.webp" alt={storeName} className="w-full h-full object-cover" />
              </div>
              <div
                className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center"
                style={{ width: 'clamp(2.5rem, 7vh, 4rem)', height: 'clamp(2.5rem, 7vh, 4rem)', fontSize: 'clamp(1.1rem, 3.2vh, 1.8rem)', background: '#F0E4D4', border: '3px solid #C4865A' }}
              >
                🐾
              </div>
            </div>
            <div className="text-center">
              <p className="font-bold" style={{ color: TEXT_LIGHT, fontSize: 'clamp(1.6rem, 5.5vh, 3.2rem)' }}>ยินดีต้อนรับสู่ {storeName}</p>
              <p style={{ color: TEXT_MUTED, fontSize: 'clamp(1rem, 2.8vh, 1.6rem)', marginTop: 'clamp(0.25rem, 1vh, 0.75rem)' }}>แจ้งพนักงานที่เคาน์เตอร์เพื่อเริ่มการขายได้เลยค่ะ</p>
            </div>
          </div>
        )}

        {msg?.stage === 'cart' && (msg.items.length > 0 || msg.customer) && (
          <div className="w-full h-full flex" style={{ gap: 'clamp(0.75rem, 2vw, 2rem)' }}>
            <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col" style={{ padding: 'clamp(0.75rem, 2.5vh, 1.5rem)' }}>
              <p className="font-medium text-gray-500 shrink-0" style={{ fontSize: 'clamp(0.9rem, 2.4vh, 1.4rem)', marginBottom: 'clamp(0.5rem, 1.5vh, 1rem)' }}>
                รายการสินค้า {msg.items.length > 0 && `(${msg.items.length})`}
              </p>
              {msg.items.length === 0 ? (
                <p className="text-gray-300 text-center py-8" style={{ fontSize: 'clamp(1rem, 3vh, 1.6rem)' }}>ยังไม่มีสินค้า</p>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="divide-y divide-gray-100">
                    {msg.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between" style={{ padding: 'clamp(0.5rem, 1.8vh, 1rem) 0', gap: '1rem' }}>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate" style={{ fontSize: 'clamp(1.2rem, 3.6vh, 2.2rem)' }}>{it.name}</p>
                          <p className="text-gray-400" style={{ fontSize: 'clamp(0.85rem, 2.3vh, 1.3rem)' }}>{it.quantity} {it.unit} × ฿{money(it.unitPrice)}</p>
                        </div>
                        <p className="font-bold text-gray-900 shrink-0" style={{ fontSize: 'clamp(1.2rem, 3.6vh, 2.2rem)' }}>฿{money(it.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                  <div ref={itemsEndRef} />
                </div>
              )}
            </div>
            <div className="flex flex-col justify-center shrink-0" style={{ width: 'clamp(16rem, 36vw, 32rem)', gap: 'clamp(0.75rem, 2.5vh, 1.5rem)' }}>
              <div className="rounded-2xl text-white" style={{ background: '#C4865A', padding: 'clamp(1rem, 3.5vh, 2rem)' }}>
                <p className="opacity-90" style={{ fontSize: 'clamp(1rem, 2.8vh, 1.6rem)' }}>ยอดรวม</p>
                <DiscountLine subtotal={msg.subtotal} discount={msg.discount} />
                <p className="font-bold leading-tight whitespace-nowrap" style={{ fontSize: bigMoneyFont(msg.total, 9, 30, 27) }}>฿{money(msg.total)}</p>
              </div>
              {msg.customer && <PointsCard customer={msg.customer} />}
            </div>
          </div>
        )}

        {msg?.stage === 'payment' && (
          <div className="w-full h-full flex items-center justify-center" style={{ gap: 'clamp(1rem, 4vw, 4rem)' }}>
            <div className="flex flex-col items-center shrink-0">
              {msg.method === 'transfer' ? (
                paymentQrUrl ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center" style={{ padding: 'clamp(0.75rem, 2.5vh, 1.5rem)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={paymentQrUrl} alt="QR รับเงิน" className="object-contain" style={{ width: qrBoxSize, height: qrBoxSize }} />
                    <p className="text-gray-500" style={{ fontSize: 'clamp(0.85rem, 2.3vh, 1.3rem)', marginTop: 'clamp(0.5rem, 1.5vh, 1rem)' }}>สแกนแล้วพิมพ์ยอด ฿{money(msg.total)} เอง</p>
                  </div>
                ) : qrPayload ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center" style={{ padding: 'clamp(0.75rem, 2.5vh, 1.5rem)' }}>
                    <QRCodeSVG value={qrPayload} size={512} style={{ width: qrBoxSize, height: qrBoxSize }} />
                    <p className="text-gray-500" style={{ fontSize: 'clamp(0.85rem, 2.3vh, 1.3rem)', marginTop: 'clamp(0.5rem, 1.5vh, 1rem)' }}>สแกนจ่ายผ่านแอปธนาคาร (PromptPay)</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 text-center" style={{ padding: 'clamp(1.5rem, 5vh, 3rem)', maxWidth: '38vw' }}>
                    <p className="text-gray-400" style={{ fontSize: 'clamp(1rem, 2.8vh, 1.6rem)' }}>
                      {qrError ? 'สร้าง QR ไม่สำเร็จ กรุณาตรวจสอบ PromptPay ID' : 'ยังไม่ได้ตั้งค่า QR รับเงินในหน้าตั้งค่าร้าน'}
                    </p>
                  </div>
                )
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 text-center" style={{ padding: 'clamp(1.5rem, 5vh, 3rem) clamp(2rem, 6vw, 4rem)' }}>
                  <p className="font-semibold text-gray-700" style={{ fontSize: 'clamp(1.4rem, 4.5vh, 2.6rem)' }}>ชำระโดย {PAYMENT_TH[msg.method] ?? msg.method}</p>
                  <p className="text-gray-400" style={{ fontSize: 'clamp(1rem, 2.8vh, 1.6rem)', marginTop: 'clamp(0.25rem, 1vh, 0.5rem)' }}>แจ้งพนักงานที่แคชเชียร์</p>
                </div>
              )}
            </div>
            <div className="flex flex-col justify-center min-w-0" style={{ width: 'clamp(16rem, 40vw, 36rem)', gap: 'clamp(0.75rem, 2.5vh, 1.5rem)' }}>
              <div className="rounded-2xl text-white text-center" style={{ background: '#C4865A', padding: 'clamp(1rem, 4vh, 2.5rem)' }}>
                <p className="opacity-90" style={{ fontSize: 'clamp(1.1rem, 3.2vh, 1.8rem)' }}>ยอดที่ต้องชำระ</p>
                <DiscountLine subtotal={msg.subtotal} discount={msg.discount} />
                <p className="font-bold leading-tight whitespace-nowrap" style={{ fontSize: bigMoneyFont(msg.total, 11, 33, 30) }}>฿{money(msg.total)}</p>
              </div>
              {msg.customer && <PointsCard customer={msg.customer} />}
            </div>
          </div>
        )}

        {msg?.stage === 'done' && (
          <div className="text-center" style={{ maxWidth: 'min(90vw, 44rem)' }}>
            <CheckCircle2 className="mx-auto text-green-500" style={{ width: 'clamp(4rem, 14vh, 8rem)', height: 'clamp(4rem, 14vh, 8rem)', marginBottom: 'clamp(0.5rem, 2vh, 1.25rem)' }} />
            <p className="font-bold" style={{ color: TEXT_LIGHT, fontSize: 'clamp(1.8rem, 6vh, 3.5rem)' }}>ชำระเงินสำเร็จ ขอบคุณค่ะ</p>
            <p className="font-bold whitespace-nowrap" style={{ color: TEXT_LIGHT, fontSize: bigMoneyFont(msg.total, 10, 84, 42), marginTop: 'clamp(0.25rem, 1.5vh, 1rem)' }}>฿{money(msg.total)}</p>
            {msg.customer && <div style={{ marginTop: 'clamp(1rem, 3.5vh, 2rem)' }}><PointsCard customer={msg.customer} /></div>}
          </div>
        )}
      </div>
    </div>
  )
}
