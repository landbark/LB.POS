'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Upload, Download, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { parseCsv, downloadCsv, headerIndexer } from '@/lib/csv'
import type { Supplier } from '@/lib/types'

const HEADERS = ['ชื่อบริษัท', 'ชื่อผู้ติดต่อ', 'เบอร์โทร', 'ที่อยู่', 'หมายเหตุ']

interface DraftRow {
  rowNum: number
  name: string
  contact_name: string
  phone: string
  address: string
  notes: string
  error: string | null
  existingId: string | null
}

interface ImportResult {
  rowNum: number
  name: string
  ok: boolean
  message: string
}

function downloadTemplate() {
  downloadCsv(
    [
      HEADERS,
      ['บจก.เพ็ทฟู้ดไทย', 'คุณสมชาย', '081-234-5678', '99 ถ.พหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900', 'ส่งทุกวันจันทร์'],
      ['ร้านทรายแมวส่ง', '', '02-123-4567', '', ''],
    ],
    'landbark-ซัพพลายเออร์-template.csv',
  )
}

export default function SupplierImportButton({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ImportResult[] | null>(null)

  function reset() {
    setDrafts(null)
    setResults(null)
    setImporting(false)
    setProgress(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  function close() {
    setOpen(false)
    reset()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const rows = parseCsv(await file.text())
    if (rows.length < 2) {
      toast.error('ไฟล์ว่างเปล่า หรือไม่มีข้อมูล')
      return
    }
    const idx = headerIndexer(rows[0])
    const col = {
      name: idx('ชื่อบริษัท'),
      contact_name: idx('ชื่อผู้ติดต่อ'),
      phone: idx('เบอร์โทร'),
      address: idx('ที่อยู่'),
      notes: idx('หมายเหตุ'),
    }
    if (col.name < 0) {
      toast.error('ไม่พบคอลัมน์ "ชื่อบริษัท" — กรุณาใช้ template')
      return
    }
    const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')

    const existingByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]))
    const seen = new Set<string>()

    const parsed: DraftRow[] = rows.slice(1).map((r, i) => {
      const name = get(r, col.name)
      const key = name.toLowerCase()
      let error: string | null = null
      if (!name) error = 'ไม่มีชื่อบริษัท'
      else if (seen.has(key)) error = 'ชื่อซ้ำกันในไฟล์'
      if (name) seen.add(key)

      return {
        rowNum: i + 2,
        name,
        contact_name: get(r, col.contact_name),
        phone: get(r, col.phone),
        address: get(r, col.address),
        notes: get(r, col.notes),
        error,
        existingId: existingByName.get(key) ?? null,
      }
    })
    setDrafts(parsed)
  }

  async function runImport() {
    if (!drafts) return
    const validRows = drafts.filter((d) => !d.error)
    if (validRows.length === 0) {
      toast.error('ไม่มีรายการที่นำเข้าได้')
      return
    }

    setImporting(true)
    const supabase = createClient()
    const out: ImportResult[] = []

    for (let i = 0; i < validRows.length; i++) {
      const d = validRows[i]
      setProgress(i + 1)

      const payload = {
        name: d.name,
        contact_name: d.contact_name || null,
        phone: d.phone || null,
        address: d.address || null,
        notes: d.notes || null,
      }

      // ชื่อซ้ำกับที่มีอยู่ = อัปเดตข้อมูลเดิม (ไม่สร้างซ้ำ)
      const { error } = d.existingId
        ? await supabase.from('suppliers').update(payload).eq('id', d.existingId)
        : await supabase.from('suppliers').insert(payload)

      out.push({
        rowNum: d.rowNum,
        name: d.name,
        ok: !error,
        message: error
          ? (error.code === '23505' ? 'มีชื่อบริษัทนี้อยู่แล้ว' : error.message)
          : d.existingId ? 'อัปเดตข้อมูลเดิม' : 'เพิ่มใหม่แล้ว',
      })
    }

    setImporting(false)
    setResults(out)
    router.refresh()
  }

  const readyCount = drafts?.filter((d) => !d.error).length ?? 0

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        <Upload size={16} />
        นำเข้าเป็นชุด
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
              <h2 className="font-bold text-gray-900">นำเข้าซัพพลายเออร์เป็นชุด</h2>
              <button onClick={close} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {!drafts && (
                <>
                  <p className="text-sm text-gray-600">
                    ดาวน์โหลด template (เปิดแก้ไขได้ทั้ง Excel และ Google Sheets) ใส่รายชื่อซัพพลายเออร์แล้วอัปโหลดกลับมาที่นี่
                    — ถ้า <span className="font-medium">ชื่อบริษัท</span> ตรงกับที่มีอยู่แล้ว ระบบจะอัปเดตข้อมูลเดิมให้ ไม่สร้างซ้ำ
                  </p>
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg"
                  >
                    <Download size={15} />
                    ดาวน์โหลด Template (CSV)
                  </button>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">อัปโหลดไฟล์ที่กรอกแล้ว (.csv)</label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFile}
                      className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      บันทึกจาก Excel/Sheets เป็น .csv (Google Sheets: File → Download → Comma-separated values)
                    </p>
                  </div>
                </>
              )}

              {drafts && !results && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      พบ {drafts.length} รายการ — พร้อมนำเข้า{' '}
                      <span className="font-semibold text-green-600">{readyCount}</span> รายการ
                      {drafts.some((d) => d.error) && (
                        <> · ข้าม <span className="font-semibold text-red-500">{drafts.length - readyCount}</span> รายการ (มีปัญหา)</>
                      )}
                    </p>
                    <button onClick={reset} className="text-xs text-blue-600 hover:text-blue-700 font-medium">เลือกไฟล์ใหม่</button>
                  </div>
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="text-left px-3 py-2">แถว</th>
                          <th className="text-left px-3 py-2">ชื่อบริษัท</th>
                          <th className="text-left px-3 py-2">ผู้ติดต่อ</th>
                          <th className="text-left px-3 py-2">เบอร์โทร</th>
                          <th className="text-left px-3 py-2">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {drafts.map((d) => (
                          <tr key={d.rowNum} className={d.error ? 'bg-red-50/50' : ''}>
                            <td className="px-3 py-1.5 text-gray-400">{d.rowNum}</td>
                            <td className="px-3 py-1.5 text-gray-800">{d.name || '—'}</td>
                            <td className="px-3 py-1.5 text-gray-500">{d.contact_name || '—'}</td>
                            <td className="px-3 py-1.5 text-gray-500">{d.phone || '—'}</td>
                            <td className="px-3 py-1.5">
                              {d.error ? (
                                <span className="text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {d.error}</span>
                              ) : d.existingId ? (
                                <span className="text-amber-600 flex items-center gap-1"><CheckCircle2 size={12} /> อัปเดตของเดิม</span>
                              ) : (
                                <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={12} /> เพิ่มใหม่</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {results && (
                <>
                  <p className="text-sm text-gray-600">
                    นำเข้าสำเร็จ <span className="font-semibold text-green-600">{results.filter((r) => r.ok).length}</span> รายการ
                    {results.some((r) => !r.ok) && (
                      <> · ล้มเหลว <span className="font-semibold text-red-500">{results.filter((r) => !r.ok).length}</span> รายการ</>
                    )}
                  </p>
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="text-left px-3 py-2">แถว</th>
                          <th className="text-left px-3 py-2">ชื่อบริษัท</th>
                          <th className="text-left px-3 py-2">ผลลัพธ์</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {results.map((r) => (
                          <tr key={r.rowNum} className={r.ok ? '' : 'bg-red-50/50'}>
                            <td className="px-3 py-1.5 text-gray-400">{r.rowNum}</td>
                            <td className="px-3 py-1.5 text-gray-800">{r.name}</td>
                            <td className={`px-3 py-1.5 ${r.ok ? 'text-green-600' : 'text-red-600'}`}>{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-2 shrink-0">
              {!drafts && (
                <button onClick={close} className="ml-auto px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700">
                  ปิด
                </button>
              )}
              {drafts && !results && (
                <>
                  <button onClick={close} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700">
                    ยกเลิก
                  </button>
                  <button
                    onClick={runImport}
                    disabled={importing || readyCount === 0}
                    className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-lg"
                  >
                    {importing && <Loader2 size={15} className="animate-spin" />}
                    {importing ? `กำลังนำเข้า... (${progress}/${readyCount})` : 'นำเข้า'}
                  </button>
                </>
              )}
              {results && (
                <button onClick={close} className="ml-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
                  เสร็จสิ้น
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
