'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Flashlight, FlashlightOff, Loader2, SwitchCamera, Check } from 'lucide-react'
import type { DecodeHintType } from '@zxing/library'

export type ScanFeedback = { ok: boolean; message: string }

// focusMode / zoom / torch ใช้ได้จริงบนมือถือ แต่ยังไม่อยู่ใน lib.dom — ประกาศเพิ่มเอง
type AdvancedConstraint = MediaTrackConstraintSet & {
  focusMode?: string
  zoom?: number
  torch?: boolean
}

type CameraCapabilities = MediaTrackCapabilities & {
  torch?: boolean
  zoom?: { min?: number }
}

// Chrome บน Android อ่านบาร์โค้ดได้เองในตัว แต่ TS ยังไม่มี type ของ BarcodeDetector ให้
interface BarcodeDetectorCtor {
  new (options: { formats: string[] }): { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
  getSupportedFormats?: () => Promise<string[]>
}

interface Props {
  // คืนข้อความไปโชว์ใต้กล้อง — ยิงรัวได้ไม่ต้องปิดเปิดใหม่ทีละชิ้น
  onDetect: (code: string) => ScanFeedback | void
  onClose: () => void
}

// ยิงซ้ำรหัสเดิมภายในเวลานี้ไม่นับ — กล้องอ่านบาร์โค้ดเดิมได้หลายสิบครั้งต่อวินาที
const REPEAT_MS = 1500

// บาร์โค้ดที่เจอบนกล่องสินค้าในร้าน (EAN/UPC) + CODE_128/39 ของฉลากที่พิมพ์เอง
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar']

// กล้องที่ผู้ใช้เลือกเอง — จำไว้ให้เครื่องนั้นไม่ต้องเลือกใหม่ทุกครั้ง
const DEVICE_KEY = 'pos.scanner.deviceId'

// เลนส์ที่โฟกัสระยะใกล้ไม่ได้ (tele/periscope) หรือไม่ได้ไว้ถ่ายภาพจริง — อย่าเลือกมาสแกน
const BAD_LENS = /tele|periscope|ultra.?wide|macro|depth|mono(chrome)?|infrared|\bir\b/i
const BACK_LENS = /back|rear|environment|หลัง/i

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
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

function savedDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY)
  } catch {
    return null
  }
}

/**
 * มือถือที่มีกล้องหลังหลายตัว (OPPO/vivo/Samsung รุ่นใหม่) จะโผล่ทุกเลนส์แยกกัน
 * แล้ว facingMode: 'environment' ได้ตัวไหนก็ได้ตามที่ระบบ list มา — ถ้าโดน periscope
 * เข้าไปจะโฟกัสบาร์โค้ดระยะมือไม่ติดเลย เลยต้องคัดเลนส์เองเท่าที่ชื่อบอกได้
 * (Android หลายรุ่นชื่อเป็น "camera2 0, facing back" ไม่บอกอะไร — จึงมีปุ่มสลับกล้องไว้ให้เลือกเอง)
 */
function pickBackCamera(cams: MediaDeviceInfo[]): string | null {
  const back = cams.filter((d) => BACK_LENS.test(d.label))
  const pool = back.length ? back : cams
  const good = pool.filter((d) => !BAD_LENS.test(d.label))
  return (good[0] ?? pool[0])?.deviceId ?? null
}

export default function BarcodeScanner({ onDetect, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [starting, setStarting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchable, setTorchable] = useState(false)
  // null = ให้เบราว์เซอร์เลือกกล้องหลังเอง (รอบแรกที่ยังไม่รู้ว่าเครื่องนี้มีเลนส์อะไรบ้าง)
  const [deviceId, setDeviceId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : savedDeviceId(),
  )
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)

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

  function chooseCamera(id: string) {
    try {
      localStorage.setItem(DEVICE_KEY, id)
    } catch {
      /* โหมดส่วนตัวเขียนไม่ได้ก็ใช้ได้แค่รอบนี้ */
    }
    setShowPicker(false)
    if (id !== deviceId) {
      setStarting(true)
      setDeviceId(id)
    }
  }

  useEffect(() => {
    // จับ element ไว้ตั้งแต่ต้น — ตอน cleanup ทำงาน videoRef.current อาจถูกเคลียร์ไปแล้ว
    const videoEl = videoRef.current
    let stopped = false
    let stream: MediaStream | null = null
    let controls: { stop: () => void } | null = null
    let raf = 0

    async function openCamera(id: string | null) {
      const video: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // เลนส์หลักมักโฟกัสใกล้ได้ดีที่สุดตอนไม่ซูม — เครื่องที่ default มาที่ 2x/3x จะถูกดึงกลับ
        advanced: [{ focusMode: 'continuous' }] as AdvancedConstraint[],
      }
      if (id) video.deviceId = { exact: id }
      else video.facingMode = { ideal: 'environment' }
      return navigator.mediaDevices.getUserMedia({ video, audio: false })
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('เบราว์เซอร์นี้เปิดกล้องไม่ได้ — ใช้ Chrome หรือ Safari และต้องเป็น https')
        setStarting(false)
        return
      }

      try {
        stream = await openCamera(deviceId)
      } catch (e) {
        const name = (e as { name?: string } | null)?.name
        // กล้องที่จำไว้หายไป (เปลี่ยนเครื่อง/ถอนสิทธิ์) — ถอยไปใช้กล้องหลังตัวไหนก็ได้
        if (deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
          try {
            localStorage.removeItem(DEVICE_KEY)
          } catch { /* ไม่เป็นไร */ }
          if (!stopped) setDeviceId(null)
          return
        }
        setError(
          name === 'NotAllowedError'
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

      const video = videoEl
      if (!video) return

      const track = stream.getVideoTracks()[0]
      trackRef.current = track ?? null
      const caps: CameraCapabilities = track?.getCapabilities?.() ?? {}
      setTorchable(Boolean(caps.torch))
      setTorchOn(false)
      setActiveId(track?.getSettings?.().deviceId ?? null)

      // บางเครื่องเปิดกล้องมาที่ซูม 2x-3x ค้างไว้ ทำให้ส่องบาร์โค้ดระยะมือแล้วเบลอ — ดึงกลับสุด
      if (caps.zoom && typeof caps.zoom.min === 'number') {
        await track
          .applyConstraints({ advanced: [{ zoom: caps.zoom.min }] as AdvancedConstraint[] })
          .catch(() => {})
      }

      // ชื่อกล้องจะอ่านได้ก็ต่อเมื่อได้สิทธิ์ใช้กล้องแล้ว — เลยมาถามรายชื่อตอนนี้
      const cams = (await navigator.mediaDevices.enumerateDevices().catch(() => []))
        .filter((d) => d.kind === 'videoinput')
      if (stopped) return
      setCameras(cams)

      // รอบแรกของเครื่องนี้: ถ้าเบราว์เซอร์หยิบเลนส์ tele/periscope มาให้ ย้ายไปเลนส์ปกติเอง
      if (!deviceId && cams.length > 1) {
        const current = cams.find((d) => d.deviceId === track?.getSettings?.().deviceId)
        const better = pickBackCamera(cams)
        if (current && BAD_LENS.test(current.label) && better && better !== current.deviceId) {
          // จำไว้เลย ครั้งหน้าจะได้ไม่ต้องเปิดกล้องผิดตัวก่อนแล้วค่อยสลับ
          try {
            localStorage.setItem(DEVICE_KEY, better)
          } catch { /* ไม่เป็นไร */ }
          setDeviceId(better)
          return
        }
      }

      video.srcObject = stream
      await video.play().catch(() => {})
      setStarting(false)

      // Chrome บน Android อ่านบาร์โค้ดได้เองในตัว เร็วกว่าและกินแบตน้อยกว่า
      const Detector = (window as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
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
      const hints = new Map<DecodeHintType, unknown>()
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
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 })
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
      if (videoEl) videoEl.srcObject = null
    }
  }, [handleCode, deviceId])

  async function toggleTorch() {
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] as AdvancedConstraint[] })
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
          {cameras.length > 1 && (
            <button
              onClick={() => setShowPicker((v) => !v)}
              aria-label="สลับกล้อง"
              className="p-2 rounded-lg hover:bg-white/10"
            >
              <SwitchCamera size={20} />
            </button>
          )}
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

        {showPicker && (
          <div className="absolute inset-x-0 bottom-0 bg-black/85 p-3 backdrop-blur-sm">
            <p className="px-2 pb-2 text-xs text-white/60">
              ภาพเบลอ/สแกนไม่ติด = ติดเลนส์ซูม ลองสลับเป็นตัวอื่นดู
            </p>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {cameras.map((cam, i) => (
                <button
                  key={cam.deviceId || i}
                  onClick={() => chooseCamera(cam.deviceId)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
                >
                  <Check
                    size={16}
                    className={cam.deviceId === activeId ? 'text-green-400' : 'text-transparent'}
                  />
                  <span className="truncate">{cam.label || `กล้อง ${i + 1}`}</span>
                </button>
              ))}
            </div>
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
