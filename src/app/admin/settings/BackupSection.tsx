'use client'

import { useState } from 'react'
import { Download, ShieldCheck, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

/** Chrome/Edge บนเดสก์ท็อปเปิดหน้าต่าง "Save As" ให้เลือกที่เก็บเองได้ */
interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<{ createWritable: () => Promise<WritableStream> }>
}

const fmtSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`

export default function BackupSection() {
  const [busy, setBusy] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    const started = Date.now()

    try {
      const res = await fetch('/api/admin/backup')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'สำรองข้อมูลไม่สำเร็จ')
      }

      const rows = res.headers.get('X-Backup-Rows') ?? '?'
      const files = res.headers.get('X-Backup-Files') ?? '?'
      const stamp = new Date().toLocaleString('sv', { timeZone: 'Asia/Bangkok' })
        .replace(/[: ]/g, '-').slice(0, 16)
      const filename = `landbark-backup-${stamp}.zip`
      const blob = await res.blob()

      const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker

      if (picker) {
        // เลือกที่เก็บเองได้ — เซฟตรงลง iCloud/Drive ได้เลยไม่ต้องย้ายทีหลัง
        try {
          const handle = await picker({
            suggestedName: filename,
            types: [{ description: 'ไฟล์สำรองข้อมูล', accept: { 'application/zip': ['.zip'] } }],
          })
          const writable = await handle.createWritable()
          await blob.stream().pipeTo(writable)
        } catch (err) {
          // ผู้ใช้กดยกเลิกหน้าต่างเลือกที่เก็บ — ไม่ใช่ข้อผิดพลาด
          if (err instanceof DOMException && err.name === 'AbortError') return
          throw err
        }
      } else {
        // Safari/Firefox ยังไม่รองรับ — ลงโฟลเดอร์ดาวน์โหลดตามปกติ
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }

      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      setLastRun(`${rows} แถว · ${files} ไฟล์ · ${fmtSize(blob.size)} · ใช้เวลา ${seconds} วินาที`)
      toast.success('สำรองข้อมูลเรียบร้อย')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'สำรองข้อมูลไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-gray-400" />
        <h2 className="font-semibold text-gray-900">สำรองข้อมูล</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        ดาวน์โหลดข้อมูลทั้งร้านเป็นไฟล์ zip — ข้อมูลทุกตาราง รูปสินค้า และสลิปโอนเงิน
        <br />
        แนะนำให้กดสัปดาห์ละครั้ง แล้วเก็บไฟล์ไว้ใน iCloud หรือ Google Drive
      </p>

      <button
        onClick={download}
        disabled={busy}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        {busy ? 'กำลังรวบรวมข้อมูล...' : 'สำรองข้อมูลตอนนี้'}
      </button>

      {lastRun && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3">
          ✓ {lastRun}
        </p>
      )}

      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
        ไฟล์ที่ได้มีชื่อ เบอร์โทร ที่อยู่ และประวัติการซื้อของลูกค้าทุกคน — เก็บในที่ปลอดภัย
        อย่าส่งต่อหรือแชร์ลิงก์สาธารณะ
      </p>
    </div>
  )
}
