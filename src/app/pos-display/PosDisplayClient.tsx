'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import generatePayload from 'promptpay-qr'
import { Maximize, Minimize, CheckCircle2 } from 'lucide-react'
import { POS_DISPLAY_CHANNEL, type PosDisplayMessage, type DisplayCustomer } from '@/lib/posDisplay'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

const PAYMENT_TH: Record<string, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน / สแกน QR',
  card: 'บัตรเครดิต',
}

function PointsCard({ customer }: { customer: DisplayCustomer }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: '#F0E4D4' }}>
      <p className="text-sm font-medium mb-3" style={{ color: '#7A4E2D' }}>แต้มสะสมของ {customer.name}</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-2xl font-bold" style={{ color: '#7A4E2D' }}>{customer.pointsBefore.toLocaleString('th-TH')}</p>
          <p className="text-xs text-gray-500 mt-0.5">แต้มเดิม</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-green-600">+{customer.pointsEarned.toLocaleString('th-TH')}</p>
          <p className="text-xs text-gray-500 mt-0.5">ได้รับวันนี้</p>
        </div>
        <div>
          <p className="text-2xl font-bold" style={{ color: '#C4865A' }}>{customer.pointsAfter.toLocaleString('th-TH')}</p>
          <p className="text-xs text-gray-500 mt-0.5">รวมใหม่</p>
        </div>
      </div>
    </div>
  )
}

export default function PosDisplayClient({ storeName, logoUrl }: { storeName: string; logoUrl: string | null }) {
  const [msg, setMsg] = useState<PosDisplayMessage | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen()
    }
  }

  let qrPayload: string | null = null
  let qrError = false
  if (msg?.stage === 'payment' && msg.method === 'transfer' && msg.promptpayId) {
    try {
      qrPayload = generatePayload(msg.promptpayId, { amount: msg.total > 0 ? msg.total : undefined })
    } catch {
      qrError = true
    }
  }

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex flex-col"
      style={{ background: '#FDF6EE' }}
    >
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 p-2 rounded-lg bg-white/70 hover:bg-white text-gray-500 shadow-sm z-10"
        title={fullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'}
      >
        {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>

      <div className="flex items-center justify-center gap-3 pt-6 pb-2 shrink-0">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={storeName} className="h-12 w-12 object-contain" />
        )}
        <h1 className="text-2xl font-bold" style={{ color: '#7A4E2D' }}>{storeName}</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        {(!msg || (msg.stage === 'cart' && msg.items.length === 0 && !msg.customer)) && (
          <div className="text-center">
            <p className="text-5xl mb-4">🐾</p>
            <p className="text-2xl font-bold" style={{ color: '#7A4E2D' }}>ยินดีต้อนรับสู่ {storeName}</p>
          </div>
        )}

        {msg?.stage === 'cart' && (msg.items.length > 0 || msg.customer) && (
          <div className="w-full max-w-3xl grid grid-cols-3 gap-6">
            <div className="col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 max-h-[60vh] overflow-y-auto">
              <p className="text-sm font-medium text-gray-500 mb-3">รายการสินค้า</p>
              {msg.items.length === 0 ? (
                <p className="text-gray-300 text-center py-8">ยังไม่มีสินค้า</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {msg.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-base font-medium text-gray-900">{it.name}</p>
                        <p className="text-xs text-gray-400">{it.quantity} {it.unit} × ฿{money(it.unitPrice)}</p>
                      </div>
                      <p className="text-base font-bold text-gray-900">฿{money(it.subtotal)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl p-5 text-white" style={{ background: '#C4865A' }}>
                <p className="text-sm opacity-90">ยอดรวม</p>
                <p className="text-3xl font-bold mt-1">฿{money(msg.total)}</p>
                {msg.discount > 0 && <p className="text-xs opacity-80 mt-1">ลด ฿{money(msg.discount)}</p>}
              </div>
              {msg.customer && <PointsCard customer={msg.customer} />}
            </div>
          </div>
        )}

        {msg?.stage === 'payment' && (
          <div className="w-full max-w-3xl grid grid-cols-2 gap-8 items-center">
            <div className="flex flex-col items-center">
              {msg.method === 'transfer' ? (
                qrPayload ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center">
                    <QRCodeSVG value={qrPayload} size={240} />
                    <p className="text-xs text-gray-400 mt-3">สแกนจ่ายผ่านแอปธนาคาร (PromptPay)</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center max-w-xs">
                    <p className="text-gray-400 text-sm">
                      {qrError ? 'สร้าง QR ไม่สำเร็จ กรุณาตรวจสอบ PromptPay ID' : 'ยังไม่ได้ตั้งค่า PromptPay ID ในหน้าตั้งค่าร้าน'}
                    </p>
                  </div>
                )
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-10 py-8 text-center">
                  <p className="text-lg font-medium text-gray-700">ชำระโดย {PAYMENT_TH[msg.method] ?? msg.method}</p>
                  <p className="text-sm text-gray-400 mt-1">แจ้งพนักงานที่แคชเชียร์</p>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl p-6 text-white text-center" style={{ background: '#C4865A' }}>
                <p className="text-sm opacity-90">ยอดที่ต้องชำระ</p>
                <p className="text-4xl font-bold mt-1">฿{money(msg.total)}</p>
              </div>
              {msg.customer && <PointsCard customer={msg.customer} />}
            </div>
          </div>
        )}

        {msg?.stage === 'done' && (
          <div className="text-center max-w-md">
            <CheckCircle2 size={64} className="mx-auto text-green-500 mb-3" />
            <p className="text-2xl font-bold" style={{ color: '#7A4E2D' }}>ชำระเงินสำเร็จ ขอบคุณค่ะ</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">฿{money(msg.total)}</p>
            {msg.customer && <div className="mt-5"><PointsCard customer={msg.customer} /></div>}
          </div>
        )}
      </div>
    </div>
  )
}
