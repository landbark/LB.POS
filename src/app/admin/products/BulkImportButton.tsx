'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Upload, Download, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Category, Unit } from '@/lib/types'

const HEADERS = ['ชื่อสินค้า', 'SKU', 'บาร์โค้ด', 'หมวดหมู่', 'หน่วย', 'ราคาขาย', 'ราคาทุน', 'แจ้งเตือนสต็อคต่ำกว่า', 'ซัพพลายเออร์']

interface DraftRow {
  rowNum: number
  name: string
  sku: string
  barcode: string
  category: string
  unit: string
  price: string
  cost: string
  minStock: string
  supplier: string
  error: string | null
}

interface ImportResult {
  rowNum: number
  name: string
  ok: boolean
  message: string
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c === '\r') {
      // skip, \n handles the row push
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

function csvField(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function downloadTemplate() {
  const rows = [
    HEADERS,
    ['อาหารแมว Royal Canin 1kg', 'LB-CAT-001', '8850000000001', 'อาหารสัตว์', 'ถุง', '450', '350', '5', ''],
    ['ทรายแมว 10L', '', '', 'ทรายแมว', 'ถุง', '250', '180', '3', ''],
  ]
  const csv = rows.map((r) => r.map(csvField).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'landbark-สินค้า-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

interface Props {
  categories: Category[]
  units: Unit[]
  suppliers: { id: string; name: string }[]
}

export default function BulkImportButton({ categories, units, suppliers }: Props) {
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
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) {
      toast.error('ไฟล์ว่างเปล่า หรือไม่มีข้อมูล')
      return
    }
    const header = rows[0].map((h) => h.trim().toLowerCase())
    const idx = (name: string) => header.indexOf(name.toLowerCase())
    const col = {
      name: idx('ชื่อสินค้า'),
      sku: idx('SKU'),
      barcode: idx('บาร์โค้ด'),
      category: idx('หมวดหมู่'),
      unit: idx('หน่วย'),
      price: idx('ราคาขาย'),
      cost: idx('ราคาทุน'),
      minStock: idx('แจ้งเตือนสต็อคต่ำกว่า'),
      supplier: idx('ซัพพลายเออร์'),
    }
    const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')

    const parsed: DraftRow[] = rows.slice(1).map((r, i) => {
      const name = get(r, col.name)
      const price = get(r, col.price)
      let error: string | null = null
      if (!name) error = 'ไม่มีชื่อสินค้า'
      else if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) error = 'ราคาขายไม่ถูกต้อง'

      return {
        rowNum: i + 2,
        name,
        sku: get(r, col.sku),
        barcode: get(r, col.barcode),
        category: get(r, col.category),
        unit: get(r, col.unit),
        price,
        cost: get(r, col.cost),
        minStock: get(r, col.minStock),
        supplier: get(r, col.supplier),
        error,
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
    const categoryCache = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
    const unitCache = new Set(units.map((u) => u.name.toLowerCase()))
    const supplierCache = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]))
    const out: ImportResult[] = []

    for (let i = 0; i < validRows.length; i++) {
      const d = validRows[i]
      setProgress(i + 1)

      let categoryId: string | null = null
      if (d.category) {
        const key = d.category.toLowerCase()
        categoryId = categoryCache.get(key) ?? null
        if (!categoryId) {
          const { data } = await supabase.from('categories').insert({ name: d.category }).select('id').single()
          if (data) { categoryId = data.id; categoryCache.set(key, data.id) }
        }
      }

      const unitName = d.unit || 'ชิ้น'
      if (!unitCache.has(unitName.toLowerCase())) {
        await supabase.from('units').insert({ name: unitName })
        unitCache.add(unitName.toLowerCase())
      }

      const supplierId = d.supplier ? supplierCache.get(d.supplier.toLowerCase()) ?? null : null

      const { error } = await supabase.from('products').insert({
        name: d.name,
        sku: d.sku || null,
        barcode: d.barcode || null,
        category_id: categoryId,
        supplier_id: supplierId,
        price: parseFloat(d.price),
        cost: d.cost ? parseFloat(d.cost) : null,
        unit: unitName,
        min_stock: d.minStock ? parseInt(d.minStock) : 5,
      })

      out.push({
        rowNum: d.rowNum,
        name: d.name,
        ok: !error,
        message: error
          ? (error.code === '23505' ? 'SKU หรือบาร์โค้ดซ้ำ' : error.message)
          : d.supplier && !supplierId
            ? 'บันทึกแล้ว (ไม่พบซัพพลายเออร์ตามชื่อ — เว้นว่าง)'
            : 'บันทึกแล้ว',
      })
    }

    setImporting(false)
    setResults(out)
    router.refresh()
  }

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
              <h2 className="font-bold text-gray-900">นำเข้าสินค้าเป็นชุด</h2>
              <button onClick={close} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {!drafts && (
                <>
                  <p className="text-sm text-gray-600">
                    ดาวน์โหลด template (เปิดแก้ไขได้ทั้ง Excel และ Google Sheets) ใส่ข้อมูลสินค้าแล้วอัปโหลดกลับมาที่นี่
                    — ช่อง <span className="font-medium">หมวดหมู่</span> และ <span className="font-medium">หน่วย</span> ถ้าพิมพ์ชื่อใหม่ที่ยังไม่มีในระบบ จะสร้างให้อัตโนมัติ
                    ส่วน <span className="font-medium">ซัพพลายเออร์</span> ต้องพิมพ์ชื่อให้ตรงกับที่มีอยู่แล้วเท่านั้น
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
                      <span className="font-semibold text-green-600">{drafts.filter((d) => !d.error).length}</span> รายการ
                      {drafts.some((d) => d.error) && (
                        <> · ข้าม <span className="font-semibold text-red-500">{drafts.filter((d) => d.error).length}</span> รายการ (มีปัญหา)</>
                      )}
                    </p>
                    <button onClick={reset} className="text-xs text-blue-600 hover:text-blue-700 font-medium">เลือกไฟล์ใหม่</button>
                  </div>
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="text-left px-3 py-2">แถว</th>
                          <th className="text-left px-3 py-2">ชื่อสินค้า</th>
                          <th className="text-right px-3 py-2">ราคา</th>
                          <th className="text-left px-3 py-2">หมวดหมู่</th>
                          <th className="text-left px-3 py-2">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 max-h-64">
                        {drafts.map((d) => (
                          <tr key={d.rowNum} className={d.error ? 'bg-red-50/50' : ''}>
                            <td className="px-3 py-1.5 text-gray-400">{d.rowNum}</td>
                            <td className="px-3 py-1.5 text-gray-800">{d.name || '—'}</td>
                            <td className="px-3 py-1.5 text-right text-gray-700">{d.price || '—'}</td>
                            <td className="px-3 py-1.5 text-gray-500">{d.category || '—'}</td>
                            <td className="px-3 py-1.5">
                              {d.error ? (
                                <span className="text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> {d.error}</span>
                              ) : (
                                <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={12} /> พร้อมนำเข้า</span>
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
                          <th className="text-left px-3 py-2">ชื่อสินค้า</th>
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
                    disabled={importing || drafts.filter((d) => !d.error).length === 0}
                    className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-lg"
                  >
                    {importing && <Loader2 size={15} className="animate-spin" />}
                    {importing ? `กำลังนำเข้า... (${progress}/${drafts.filter((d) => !d.error).length})` : 'นำเข้า'}
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
