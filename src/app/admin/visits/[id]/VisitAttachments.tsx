'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { VisitAttachment } from '@/lib/types'
import { compressImage } from '@/lib/compressImage'
import { confirmDialog } from '@/lib/confirm'
import { canExamine } from '@/lib/roles'

/**
 * รูปแนบของเวชระเบียนใบหนึ่ง — รูปแผล ผลแล็บ ฟิล์ม หรือเอกสารที่ถ่ายเก็บไว้
 *
 * ต่างจากช่องอื่นในหน้านี้สองข้อ (ตามที่ร้านขอ):
 *   1. แนบย้อนหลังได้ — ใบที่เก็บเงินไปแล้วก็ยังแนบ/ลบรูปได้ ไม่ล็อกตาม status
 *   2. แคชเชียร์แนบได้ด้วย — ช่องอื่นแคชเชียร์ยังดูอย่างเดียวเหมือนเดิม
 * (ลบได้เฉพาะรูปที่ตัวเองแนบ ยกเว้นหมอ/แอดมินที่ลบของทุกคนได้ — คุมซ้ำที่ API)
 */
export default function VisitAttachments({
  visitId,
  initial,
  userId,
  role,
  locked,
}: {
  visitId: string
  initial: VisitAttachment[]
  userId: string
  role: string
  /** ใบที่ยกเลิกแล้ว — ดูรูปเก่าได้ แต่แนบเพิ่มไม่ได้ */
  locked?: boolean
}) {
  const [items, setItems] = useState<VisitAttachment[]>(initial)
  const [uploading, setUploading] = useState(0)
  const [viewing, setViewing] = useState<number | null>(null)
  const pickRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const canDelete = (a: VisitAttachment) => a.uploaded_by === userId || canExamine(role)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // เลือกไฟล์เดิมซ้ำได้
    if (!files.length) return

    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length < files.length) toast.error('ข้ามไฟล์ที่ไม่ใช่รูปภาพ')
    if (!images.length) return

    setUploading(images.length)
    const added: VisitAttachment[] = []
    for (const file of images) {
      try {
        // ย่อก่อนส่ง — รูปจากมือถือใบละหลาย MB เน็ตร้านอัปโหลดไม่ทันใจ
        const { blob, width, height } = await compressImage(file)
        const body = new FormData()
        body.append('file', new File([blob], 'photo.webp', { type: blob.type }))
        body.append('visit_id', visitId)
        body.append('width', String(width))
        body.append('height', String(height))

        const res = await fetch('/api/visit-attachment', { method: 'POST', body })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'อัปโหลดไม่สำเร็จ')
        added.push(json.attachment as VisitAttachment)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ')
      } finally {
        setUploading((n) => n - 1)
      }
    }
    if (added.length) {
      setItems((prev) => [...prev, ...added])
      toast.success(`แนบรูปแล้ว ${added.length} รูป`)
    }
  }

  async function remove(a: VisitAttachment) {
    if (!(await confirmDialog({ message: 'ลบรูปนี้ออกจากเวชระเบียน?', confirmLabel: 'ลบรูป', tone: 'danger' })).confirmed) return
    const res = await fetch('/api/visit-attachment', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error ?? 'ลบไม่สำเร็จ')
      return
    }
    setItems((prev) => prev.filter((i) => i.id !== a.id))
    setViewing(null)
    toast.success('ลบรูปแล้ว')
  }

  async function saveCaption(a: VisitAttachment, caption: string) {
    const next = caption.trim() || null
    if (next === (a.caption ?? null)) return
    setItems((prev) => prev.map((i) => (i.id === a.id ? { ...i, caption: next } : i)))
    const res = await fetch('/api/visit-attachment', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, caption: next }),
    })
    if (!res.ok) toast.error('บันทึกคำอธิบายไม่สำเร็จ')
  }

  // ดูรูปเต็มจอ: Esc ปิด, ลูกศรเลื่อนรูป
  useEffect(() => {
    if (viewing === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewing(null)
      if (e.key === 'ArrowRight') setViewing((i) => (i === null ? null : Math.min(items.length - 1, i + 1)))
      if (e.key === 'ArrowLeft') setViewing((i) => (i === null ? null : Math.max(0, i - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing, items.length])

  const current = viewing === null ? null : items[viewing] ?? null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-900">
          รูปแนบ{items.length > 0 && <span className="ml-1 text-gray-400 font-normal">({items.length})</span>}
        </h2>
        {!locked && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={uploading > 0}
              className="sm:hidden flex items-center gap-1 border border-gray-300 text-gray-700 text-xs px-2.5 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <Camera size={14} /> ถ่ายรูป
            </button>
            <button
              type="button"
              onClick={() => pickRef.current?.click()}
              disabled={uploading > 0}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-50"
            >
              {uploading > 0 ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              {uploading > 0 ? `กำลังอัปโหลด... (${uploading})` : 'แนบรูป'}
            </button>
          </div>
        )}
      </div>

      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFiles}
        className="hidden"
      />

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">
          {locked ? 'ไม่มีรูปแนบ' : 'ยังไม่มีรูปแนบ — แนบรูปแผล ผลแล็บ ฟิล์ม หรือเอกสารได้ (ย่อรูปให้อัตโนมัติ)'}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((a, idx) => (
            <div key={a.id} className="group">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setViewing(idx)}
                  className="block w-full aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url ?? ''}
                    alt={a.caption ?? 'รูปแนบเวชระเบียน'}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
                {canDelete(a) && (
                  <button
                    type="button"
                    onClick={() => remove(a)}
                    title="ลบรูปนี้"
                    className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-white text-red-500 rounded-full p-1.5 shadow-sm"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              {locked ? (
                a.caption && <p className="mt-1 text-xs text-gray-500 truncate">{a.caption}</p>
              ) : (
                <input
                  type="text"
                  defaultValue={a.caption ?? ''}
                  onBlur={(e) => saveCaption(a, e.target.value)}
                  placeholder="คำอธิบาย..."
                  className="mt-1 w-full border border-transparent hover:border-gray-200 focus:border-gray-300 rounded px-1.5 py-1 text-xs text-gray-600 focus:outline-none"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ดูรูปเต็มจอ */}
      {current && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setViewing(null)}
        >
          <button
            type="button"
            onClick={() => setViewing(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            title="ปิด"
          >
            <X size={28} />
          </button>
          {viewing !== null && viewing > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setViewing(viewing - 1) }}
              className="absolute left-2 sm:left-4 text-white/80 hover:text-white"
              title="รูปก่อนหน้า"
            >
              <ChevronLeft size={36} />
            </button>
          )}
          {viewing !== null && viewing < items.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setViewing(viewing + 1) }}
              className="absolute right-2 sm:right-4 text-white/80 hover:text-white"
              title="รูปถัดไป"
            >
              <ChevronRight size={36} />
            </button>
          )}
          <div className="max-w-full max-h-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.url ?? ''}
              alt={current.caption ?? 'รูปแนบเวชระเบียน'}
              className="max-h-[80vh] max-w-full object-contain rounded-lg"
            />
            <p className="mt-3 text-sm text-white/80 text-center">
              {current.caption && <span className="block">{current.caption}</span>}
              <span className="text-xs text-white/50">
                {new Date(current.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                {' · '}รูปที่ {(viewing ?? 0) + 1}/{items.length}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
