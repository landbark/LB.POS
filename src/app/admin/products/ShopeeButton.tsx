'use client'

import { useRef, useState } from 'react'
import { Store, X, Download, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { downloadCsv } from '@/lib/csv'
import { openXlsx, downloadBlob } from '@/lib/xlsx'
import { fillShopeeStock, stockOf, type FillResult, type StockProduct } from '@/lib/shopeeStockFile'

interface Product extends StockProduct {
  barcode: string | null
  price: number
  unit: string
}

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/**
 * เครื่องมือ Shopee ที่หน้าสินค้า
 *
 * - อัปเดตสต็อก: เติมสต็อกคงเหลือลงเทมเพลต Mass Update ที่ร้านโหลดมาจาก Shopee แล้วให้ร้านอัปโหลดกลับเอง
 *   (จับคู่ด้วย SKU ทุกแถวในไฟล์ ไม่ดูธง — แถวที่อยู่ในไฟล์คือสิ่งที่ลงขายบน Shopee อยู่แล้ว)
 * - ไฟล์รายการ: CSV ราคา/สต็อกฝั่งเรา ของสินค้าที่ติดธงไว้ ไว้เทียบตาหรือกรอกมือ
 *
 * ยังไม่ยิง Shopee API ให้ตรงๆ เพราะต้องมี Partner ID/Key และต้องให้ร้านกดอนุญาตก่อน (src/lib/shopee.ts รออยู่)
 */
export default function ShopeeButton({ products }: { products: Product[] }) {
  const flagged = products.filter((p) => p.on_shopee)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<FillResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const doc = await openXlsx(file)
      const filled = fillShopeeStock(doc, products)
      setResult(filled)
      if (filled.filled.length === 0) {
        toast.error('จับคู่ SKU ในไฟล์กับสินค้าในระบบไม่ได้เลย — ยังไม่ได้ออกไฟล์')
        return
      }
      downloadBlob(await doc.toBlob(), `shopee-stock-${today()}.xlsx`)
      toast.success(`เติมสต็อก ${filled.filled.length} รายการลงไฟล์แล้ว`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'อ่านไฟล์ไม่สำเร็จ')
      reset()
    } finally {
      setBusy(false)
    }
  }

  function exportList() {
    if (flagged.length === 0) {
      toast.error('ยังไม่มีสินค้าที่ติดธง Shopee — ติ๊ก "ลงขายบน Shopee แล้ว" ที่สินค้าก่อน')
      return
    }
    downloadCsv(
      [
        ['SKU', 'ชื่อสินค้า', 'บาร์โค้ด', 'ราคาขาย', 'สต็อคคงเหลือ', 'หน่วย'],
        ...flagged.map((p) => [
          p.sku ?? '',
          p.name,
          p.barcode ?? '',
          String(p.price),
          p.is_service ? '' : String(stockOf(p)),
          p.unit,
        ]),
      ],
      `landbark-shopee-${today()}.csv`,
    )
    toast.success(`ออกไฟล์ ${flagged.length} รายการแล้ว`)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
        title="อัปเดตสต็อก Shopee / ออกไฟล์รายการสินค้าที่ลงขายไว้"
      >
        <Store size={15} /> Shopee
        <span className="text-xs text-gray-400">{flagged.length}</span>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
              <h2 className="font-bold text-gray-900">อัปเดตสต็อก Shopee</h2>
              <button
                onClick={() => {
                  setOpen(false)
                  reset()
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {!result && (
                <>
                  <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
                    <li>
                      ที่ Shopee Seller Centre → <span className="font-medium">สินค้าของฉัน</span> →{' '}
                      <span className="font-medium">อัปเดตสินค้าจำนวนมาก</span> เลือกหัวข้อที่มี
                      <span className="font-medium"> สต็อก</span> แล้วโหลดไฟล์ออกมา
                    </li>
                    <li>
                      เอาไฟล์นั้นมาใส่ช่องข้างล่างนี้ — ระบบจะเติมสต็อกคงเหลือล่าสุดให้ทุกแถวที่
                      <span className="font-medium"> SKU ตรงกับสินค้าในระบบ</span> (ไม่ต้องติ๊กธงก่อน) แล้วดาวน์โหลดกลับ
                    </li>
                    <li>อัปโหลดไฟล์ที่ได้กลับขึ้น Shopee ที่หน้าเดิม</li>
                  </ol>
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    โหลดไฟล์จาก Shopee ใหม่ทุกครั้งที่จะอัปเดต — ห้ามใช้ไฟล์เก่าซ้ำ เพราะแถวที่ระบบจับคู่ไม่ได้
                    จะพาสต็อกเก่าในไฟล์นั้นกลับขึ้น Shopee ไปด้วย
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      ไฟล์เทมเพลตจาก Shopee (.xlsx)
                    </label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx"
                      disabled={busy}
                      onChange={handleFile}
                      className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium hover:file:bg-blue-700 file:cursor-pointer cursor-pointer disabled:opacity-50"
                    />
                    {busy && (
                      <p className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                        <Loader2 size={13} className="animate-spin" /> กำลังเติมสต็อกลงไฟล์...
                      </p>
                    )}
                  </div>
                </>
              )}

              {result && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-600">
                      เติมสต็อกลงคอลัมน์{' '}
                      <span className="font-medium text-gray-900">{result.stockColumn || 'สต็อก'}</span> แล้ว{' '}
                      <span className="font-semibold text-green-600">{result.filled.length}</span> รายการ
                      {result.filled.length > 0 && <> — ไฟล์ถูกดาวน์โหลดไว้แล้ว เอาไปอัปโหลดที่ Shopee ได้เลย</>}
                    </p>
                    <button
                      onClick={reset}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0 mt-0.5"
                    >
                      เลือกไฟล์ใหม่
                    </button>
                  </div>

                  {result.extraStockColumns.length > 0 && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      ไฟล์นี้มีคอลัมน์สต็อกมากกว่าหนึ่ง (เช่นหลายคลัง) ระบบเติมให้แค่คอลัมน์แรก — ที่เหลือ
                      ({result.extraStockColumns.join(', ')}) ต้องกรอกเอง
                    </p>
                  )}

                  {result.duplicateSkus.length > 0 && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      SKU ที่โผล่หลายแถวในไฟล์ (สินค้ามีตัวเลือกย่อย) ทุกแถวได้สต็อกก้อนเดียวกัน ตรวจก่อนอัปโหลด:{' '}
                      <span className="font-medium">{result.duplicateSkus.join(', ')}</span>
                    </p>
                  )}

                  <ResultList
                    title={`จับคู่ไม่ได้ ${result.unmatchedRows.length} แถวในไฟล์`}
                    hint="ไม่ได้แตะคอลัมน์สต็อกของแถวเหล่านี้ ค่าเดิมจาก Shopee ยังอยู่"
                    rows={result.unmatchedRows.map((r) => `${r.sku || '(ไม่มี SKU)'} — ${r.name}`)}
                  />
                  <ResultList
                    title={`อัปเดตให้แล้วแต่ยังไม่ติดธง Shopee ${result.unflagged.length} รายการ`}
                    hint='สต็อกอัปเดตเรียบร้อย — ติ๊ก "ลงขายบน Shopee แล้ว" ที่สินค้าด้วยถ้าอยากให้โผล่ในไฟล์รายการ CSV'
                    rows={result.unflagged.map((r) => `${r.sku} — ${r.name}`)}
                  />
                  <ResultList
                    title={`ติดธง Shopee แต่ไม่มีในไฟล์ ${result.missingFromFile.length} รายการ`}
                    hint="ตอนโหลดเทมเพลตอาจเลือกสินค้าไม่ครบ หรือ SKU ฝั่ง Shopee ยังไม่ตรงกับของเรา"
                    rows={result.missingFromFile.map((r) => `${r.sku} — ${r.name} (คงเหลือ ${r.stock})`)}
                  />
                  <ResultList
                    title={`ติดธง Shopee แต่ยังไม่มี SKU ${result.noSku.length} รายการ`}
                    hint="ใส่ SKU ให้ตรงกับ Parent SKU ฝั่ง Shopee ก่อน ระบบจะจับคู่ให้เอง"
                    rows={result.noSku}
                  />
                </>
              )}

              <div className="border-t border-gray-100 pt-4">
                <button
                  onClick={exportList}
                  className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg"
                >
                  <Download size={15} />
                  ไฟล์รายการสินค้า (CSV)
                </button>
                <p className="text-xs text-gray-400 mt-1">
                  ราคา/สต็อกฝั่งเราของสินค้าที่ติดธงไว้ ไว้เทียบตาหรือกรอกมือ — อัปเข้า Shopee ตรงๆ ไม่ได้
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ResultList({ title, hint, rows }: { title: string; hint: string; rows: string[] }) {
  if (rows.length === 0) return null
  return (
    <details className="text-sm border border-gray-100 rounded-lg">
      <summary className="px-3 py-2 cursor-pointer text-gray-700 font-medium">{title}</summary>
      <div className="px-3 pb-3 space-y-2">
        <p className="text-xs text-gray-400">{hint}</p>
        <ul className="max-h-48 overflow-y-auto text-xs text-gray-600 space-y-0.5">
          {rows.map((r, i) => (
            <li key={i} className="truncate">
              {r}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
