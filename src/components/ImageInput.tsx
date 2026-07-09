'use client'

import { useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { ImagePlus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  label?: string
  hint?: string
  // preview ปัจจุบัน (URL เดิมจาก storage หรือ object URL ของรูปใหม่)
  preview: string | null
  onChange: (blob: Blob | null, previewUrl: string | null) => void
}

const MAX_DIM = 800 // ย่อรูปยาวสุดไม่เกิน 800px — พอสำหรับแสดงบนเว็บ

// crop ตาม area ที่เลือก แล้วย่อ + บีบอัดเป็น WebP (fallback JPEG ถ้า browser ไม่รองรับ)
async function cropAndCompress(imageSrc: string, area: Area): Promise<Blob> {
  const image = new Image()
  image.src = imageSrc
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
  })

  const scale = Math.min(1, MAX_DIM / Math.max(area.width, area.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(area.width * scale)
  canvas.height = Math.round(area.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height)

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

  let blob = await toBlob('image/webp', 0.8)
  if (!blob || blob.type !== 'image/webp') {
    blob = await toBlob('image/jpeg', 0.8)
  }
  if (!blob) throw new Error('encode failed')
  return blob
}

export default function ImageInput({ label = 'รูปภาพ', hint, preview, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  // รูปต้นฉบับที่กำลัง crop (data URL) — null = modal ปิด
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)

  function handleSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // เลือกไฟล์เดิมซ้ำได้
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพ')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCropSrc(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function handleConfirmCrop() {
    if (!cropSrc || !croppedArea) return
    setSaving(true)
    try {
      const blob = await cropAndCompress(cropSrc, croppedArea)
      onChange(blob, URL.createObjectURL(blob))
      setCropSrc(null)
    } catch {
      toast.error('ประมวลผลรูปไม่สำเร็จ ลองรูปอื่นดู')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={label}
            className="w-20 h-20 rounded-lg object-cover border border-gray-200"
          />
        ) : (
          <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300">
            <ImagePlus size={24} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium text-left"
          >
            {preview ? 'เปลี่ยนรูป' : 'เลือกรูป'}
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600"
            >
              <Trash2 size={13} /> ลบรูป
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleSelectFile} className="hidden" />
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}

      {/* modal crop รูป */}
      {cropSrc && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-4 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-3">จัดตำแหน่งรูป</h3>
            <div className="relative w-full h-72 bg-gray-900 rounded-lg overflow-hidden">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) => setCroppedArea(areaPixels)}
              />
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-xs text-gray-500 shrink-0">ซูม</span>
              <input
                type="range" min={1} max={3} step={0.05} value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-blue-600"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={handleConfirmCrop}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm"
              >
                {saving ? 'กำลังประมวลผล...' : 'ใช้รูปนี้'}
              </button>
              <button
                type="button"
                onClick={() => setCropSrc(null)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
