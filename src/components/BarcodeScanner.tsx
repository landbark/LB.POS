'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Flashlight, FlashlightOff, Loader2 } from 'lucide-react'

export type ScanFeedback = { ok: boolean; message: string }

interface Props {
  // คืนข้อความไปโชว์ใต้กล้อง — ยิงรัวได้ไม่ต้องปิดเปิดใหม่ทีละชิ้น
  onDetect: (code: string) => ScanFeedback | void
  onClose: () => void
}

// ยิงซ้ำรหัสเดิมภายในเวลานี้ไม่นับ — กล้องอ่านบาร์โค้ดเดิมได้หลายสิบครั้งต่อวินาที
const REPEAT_MS = 1500

// บาร์โค้ดที่เจอบนกล่องสินค้าในร้าน (EAN/UPC) + CODE_128/39 ของฉลากที่พิมพ์เอง
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar']

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 2000
    gain.gain.value = 0.08
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.07)
    osc.onended = () => ctx.close().catch(() => {})
  } catch {
    /* เครื่องไม่มีเสียงก็ข้ามไป */
  }
}

export default function BarcodeScanner({ onDetect, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [starting, setStarting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchable, setTorchable] = useState(false)

  const trackRef = useRef<MediaStreamTrack | null>(null)
  // เก็บรหัสล่าสุดไว้ใน ref — ลูปอ่านกล้องวิ่งอยู่นอก render จะเห็น state ไม่ทัน
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  // onDetect มาจาก closure ของหน้าขาย (ตะกร้าเปลี่ยนทุกครั้งที่ยิง) — อ่านผ่าน ref ไม่ให้ลูปต้อง restart
  const onDetectRef = useRef(onDetect)
  useEffect(() => { onDetectRef.current = onDetect }, [onDetect])

  const handleCode = useCallback((raw: string) => {
    const code = raw.trim()
    if (!code) return
    const now = Date.now()
    if (code === lastRef.current.code && now - lastRef.current.at < REPEAT_MS) return
    lastRef.current = { code, at: now }
    beep()
    navigator.vibrate?.(40)
    setFeedback(onDetectRef.current(code) ?? { ok: true, message: code })
  }, [])

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let controls: { stop: () => void } | null = null
    let raf = 0

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('เบราว์เซอร์นี้เปิดกล้องไม่ได้ — ใช้ Chrome หรือ Safari และต้องเป็น https')
        setStarting(false)
        return
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
      } catch (e: any) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง — กดไอคอนกล้อง/แม่กุญแจบนแถบที่อยู่เว็บเพื่ออนุญาต'
            : 'เปิดกล้องไม่ได้ — อาจมีแอปอื่นใช้กล้องอยู่',
        )
        setStarting(false)
        return
      }

      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      const video = videoRef.current
      if (!video) return

      const track = stream.getVideoTracks()[0]
      trackRef.current = track ?? null
      setTorchable(Boolean((track?.getCapabilities?.() as any)?.torch))

      video.srcObject = stream
      await video.play().catch(() => {})
      setStarting(false)

      // Chrome บน Android อ่านบาร์โค้ดได้เองในตัว เร็วกว่าและกินแบตน้อยกว่า
      const Detector = (window as any).BarcodeDetector
      if (Detector) {
        try {
          const supported: string[] = (await Detector.getSupportedFormats?.()) ?? []
          const formats = NATIVE_FORMATS.filter((f) => supported.includes(f))
          if (formats.length) {
            const detector = new Detector({ formats })
            const loop = async () => {
              if (stopped) return
              try {
                const found = await detector.detect(video)
                if (found?.length) handleCode(found[0].rawValue)
              } catch {
                /* เฟรมที่อ่านไม่ออกข้ามไป */
              }
              if (!stopped) raf = requestAnimationFrame(loop)
            }
            raf = requestAnimationFrame(loop)
            return
          }
        } catch {
          /* ใช้ไม่ได้ก็ตกไปใช้ zxing */
        }
      }

      // iOS Safari ยังไม่มี BarcodeDetector — ถอดรหัสด้วย zxing ใน js
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ])
      if (stopped) return
      const hints = new Map<number, unknown>()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
        BarcodeFormat.CODABAR,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)
      const reader = new BrowserMultiFormatReader(hints as any, { delayBetweenScanAttempts: 120 })
      controls = await reader.decodeFromVideoElement(video, (result) => {
        if (result) handleCode(result.getText())
      })
      if (stopped) controls.stop()
    }

    start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      controls?.stop()
      stream?.getTracks().forEach((t) => t.stop())
      trackRef.current = null
      const video = videoRef.current
      if (video) video.srcObject = null
    }
  }, [handleCode])

  async function toggleTorch() {
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as any)
      setTorchOn(next)
    } catch {
      setTorchable(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium">สแกนบาร์โค้ด</span>
        <div className="flex items-center gap-1">
          {torchable && (
            <button
              onClick={toggleTorch}
              aria-label="ไฟฉาย"
              className="p-2 rounded-lg hover:bg-white/10"
            >
              {torchOn ? <Flashlight size={20} /> : <FlashlightOff size={20} />}
            </button>
          )}
          <button onClick={onClose} aria-label="ปิด" className="p-2 rounded-lg hover:bg-white/10">
            <X size={22} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* กรอบเล็งกลางจอ — ไม่ได้ครอปภาพ แค่บอกว่าจ่อตรงไหน */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-32 w-11/12 max-w-sm rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>

        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
            <Loader2 size={18} className="animate-spin" />
            กำลังเปิดกล้อง...
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <p className="text-center text-sm leading-relaxed text-white">{error}</p>
          </div>
        )}
      </div>

      <div className="px-4 pb-6 pt-3 text-center">
        {feedback ? (
          <p className={`text-sm font-medium ${feedback.ok ? 'text-green-400' : 'text-red-400'}`}>
            {feedback.message}
          </p>
        ) : (
          <p className="text-sm text-white/60">จ่อบาร์โค้ดให้อยู่ในกรอบ — ยิงต่อกันได้เรื่อยๆ</p>
        )}
        <button
          onClick={onClose}
          className="mt-3 w-full rounded-lg bg-white/15 py-3 text-sm font-medium text-white hover:bg-white/25"
        >
          เสร็จแล้ว
        </button>
      </div>
    </div>
  )
}
