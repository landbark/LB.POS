'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { registerConfirmHost, type ConfirmRequest } from '@/lib/confirm'

// กล่องยืนยันกลางจอ — วางไว้ครั้งเดียวใน root layout แล้วเรียกใช้ด้วย confirmDialog()
export default function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [reason, setReason] = useState('')
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    registerConfirmHost((next) => {
      setReason('')
      setRequest(next)
    })
    return () => registerConfirmHost(null)
  }, [])

  useEffect(() => {
    if (!request) return
    confirmRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  function close(confirmed: boolean) {
    if (!request) return
    request.resolve({ confirmed, value: reason.trim() })
    setRequest(null)
  }

  if (!request) return null

  const danger = request.tone !== 'primary'
  const blocked = Boolean(request.reasonRequired && !reason.trim())

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) close(false) }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
        <div className="flex gap-3">
          <span className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            danger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
          }`}>
            <AlertTriangle size={20} />
          </span>
          <div className="min-w-0">
            {request.title && <h2 className="font-semibold text-gray-900">{request.title}</h2>}
            <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line">{request.message}</p>
          </div>
        </div>

        {request.reasonLabel && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {request.reasonLabel}
              {!request.reasonRequired && <span className="text-gray-400 font-normal"> (ไม่ใส่ก็ได้)</span>}
            </label>
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !blocked) close(true) }}
              placeholder={request.reasonPlaceholder}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => close(false)}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            {request.cancelLabel ?? 'ยกเลิก'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={blocked}
            onClick={() => close(true)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {request.confirmLabel ?? 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  )
}
