'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Receipt, ScanLine } from 'lucide-react'
import toast from 'react-hot-toast'
import ProductRow from './ProductRow'
import ProductCard from './ProductCard'
import BarcodeScanner, { type ScanFeedback } from '@/components/BarcodeScanner'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/lib/confirm'
import { isVatApplicable } from '@/lib/vat'
import { hasBoothPrice } from '@/lib/booth'
import { buildHaystacks } from '@/lib/productSearch'
import { findByBarcode } from '@/lib/productUnits'
import type { Product } from '@/lib/types'

// แสดงทีละชุด — ร้านมีสินค้าสองพันกว่าตัว วาดทั้งตารางทีเดียวหน้าหนืด
const PAGE = 50

/**
 * ตารางสินค้า + ช่องค้นหา
 *
 * ค้นในเครื่องทั้งหมด ไม่ยิง DB ซ้ำ — ของทั้งร้านโหลดมาอยู่แล้ว (ปุ่ม Shopee ต้องใช้ทุกตัว)
 * พิมพ์ได้หลายคำ ไม่ต้องเรียงให้ตรงกับชื่อ: "royal renal 400" เจอ ROYAL CANIN ... RENAL ... 400 G.
 */
export default function ProductsTable({ products }: { products: Product[] }) {
  const router = useRouter()
  // ติ๊กหลายตัวแล้วตั้งค่าทีเดียว — ร้านมีสินค้าสองพันตัว เข้าไปแก้ทีละตัวไม่ไหว
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [hideStopped, setHideStopped] = useState(false)
  // '' = ทุกตัว, 'yes' = เฉพาะที่เข้าข่าย VAT, 'no' = เฉพาะที่ไม่เข้าข่าย
  const [vatFilter, setVatFilter] = useState<'' | 'yes' | 'no'>('')
  // '' = ทุกตัว, 'yes' = เฉพาะที่ตั้งราคาบูธไว้ (ไว้ไล่ตรวจราคาก่อนออกงาน)
  const [boothFilter, setBoothFilter] = useState<'' | 'yes' | 'no'>('')
  const [shown, setShown] = useState(PAGE)
  const [scanning, setScanning] = useState(false)

  // กองคำค้นชุดเดียวกับหน้าขาย (ชื่อ/รหัส/บาร์โค้ด/คำค้นสำรอง) บวกหมวดกับหน่วยที่ใช้แต่ในตารางนี้
  // — ค้นในหน้าสินค้าต้องเจอด้วยคำเดียวกับที่พนักงานใช้หน้าร้าน ไม่งั้นตามแก้ของที่เขาหาไม่เจอไม่ถูก
  const haystacks = useMemo(() => {
    const base = buildHaystacks(products)
    return new Map(
      products.map((p) => [
        p.id,
        [base.get(p.id), p.categories?.name, p.unit].filter(Boolean).join(' ').toLowerCase(),
      ]),
    )
  }, [products])

  const stoppedCount = useMemo(() => products.filter((p) => !p.active).length, [products])

  const found = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    let pool = hideStopped ? products.filter((p) => p.active) : products
    if (vatFilter) {
      const want = vatFilter === 'yes'
      pool = pool.filter((p) => isVatApplicable(p) === want)
    }
    if (boothFilter) {
      const want = boothFilter === 'yes'
      pool = pool.filter((p) => hasBoothPrice(p) === want)
    }
    if (terms.length === 0) return pool
    return pool.filter((p) => {
      const haystack = haystacks.get(p.id) ?? ''
      return terms.every((t) => haystack.includes(t))
    })
  }, [products, haystacks, query, hideStopped, vatFilter, boothFilter])

  function search(value: string) {
    setQuery(value)
    setShown(PAGE) // ค้นใหม่แล้วกลับไปเริ่มที่ชุดแรก ไม่ค้างอยู่หน้าลึกๆ ของผลเก่า
  }

  /**
   * ยิงบาร์โค้ดแทนการพิมพ์ค้นหา — ของทั้งร้านโหลดมาอยู่ในหน้านี้แล้ว หาในเครื่องได้เลย
   *
   * เจอแล้วปิดกล้องทันที เพราะยิงมาเพื่อจะดู/แก้สินค้าตัวนั้น ไม่ใช่ไล่ยิงทีละกล่อง
   * ส่วนที่ยิงแล้วไม่เจอ ก็ยังใส่รหัสลงช่องค้นหาให้ จะได้เห็นว่ายังไม่มีในระบบแล้วกดเพิ่มสินค้าต่อ
   */
  function handleScan(code: string): ScanFeedback {
    const hit = findByBarcode(products, code)
    search(code.trim())
    // ตัวกรองที่ค้างอยู่อาจบังสินค้าที่เพิ่งยิงเจอ — ปลดให้หมด ไม่งั้นงงว่ายิงติดแล้วทำไมไม่ขึ้น
    setHideStopped(false)
    setVatFilter('')
    setBoothFilter('')
    if (!hit) return { ok: false, message: `ไม่พบสินค้าที่ใช้บาร์โค้ด ${code}` }
    setScanning(false)
    return { ok: true, message: hit.unit ? `${hit.product.name} (${hit.unit.unit_name})` : hit.product.name }
  }

  function toggleOne(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** ตั้งค่า VAT ให้ทุกตัวที่ติ๊กไว้ — true = มี, false = ไม่มี, null = ใช้ตามหมวดหมู่ */
  async function applyVat(value: boolean | null) {
    const ids = [...picked]
    if (ids.length === 0) return
    const label = value === null ? 'ใช้ตามหมวดหมู่' : value ? 'มี VAT' : 'ไม่มี VAT'
    const { confirmed } = await confirmDialog({
      title: `ตั้งเป็น "${label}"?`,
      message: `สินค้าที่เลือกไว้ ${ids.length.toLocaleString('th-TH')} รายการจะถูกตั้งเป็น ${label}`,
      confirmLabel: 'ตั้งค่า',
      tone: 'primary',
    })
    if (!confirmed) return

    setSaving(true)
    const supabase = createClient()
    // ยัด id เป็นพันตัวใน .in() ทีเดียวไม่ได้ ความยาว URL เกินลิมิต — แบ่งเป็นชุดละ 200
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase
        .from('products')
        .update({ vat_applicable: value })
        .in('id', ids.slice(i, i + 200))
      if (error) {
        setSaving(false)
        toast.error('ตั้งค่าไม่สำเร็จ: ' + error.message)
        return
      }
    }
    setSaving(false)
    setPicked(new Set())
    toast.success(`ตั้ง ${ids.length.toLocaleString('th-TH')} รายการเป็น ${label} แล้ว`)
    router.refresh()
  }

  /** ยิง update เป็นก้อน — id เป็นพันตัวใน .in() ทีเดียวไม่ได้ ความยาว URL เกินลิมิต */
  async function patchChunks(ids: string[], patch: Record<string, unknown>) {
    const supabase = createClient()
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from('products').update(patch).in('id', ids.slice(i, i + 200))
      if (error) throw new Error(error.message)
    }
  }

  /**
   * ตั้งราคาบูธให้ทุกตัวที่ติ๊กไว้
   *
   * mode percent = ลดจากราคาปกติของแต่ละตัว (ราคาต่างกัน ค่าที่ได้ก็ต่างกัน ต้องจับกลุ่มตามราคา
   * ที่คำนวณได้แล้วค่อยยิงทีละกลุ่ม), fixed = ราคาเดียวกันหมด, clear = ล้างให้กลับไปใช้ราคาปกติ
   */
  async function applyBoothPrice(mode: 'percent' | 'fixed' | 'clear') {
    const ids = [...picked]
    if (ids.length === 0) return
    const n = count(ids.length)

    let input = ''
    if (mode !== 'clear') {
      const ask = await confirmDialog({
        title: mode === 'percent' ? 'ลดจากราคาปกติกี่ %' : 'ตั้งราคาบูธเท่ากับเท่าไร',
        message:
          mode === 'percent'
            ? `สินค้าที่เลือกไว้ ${n} รายการจะได้ราคาบูธ = ราคาปกติหักส่วนลดนี้`
            : `สินค้าที่เลือกไว้ ${n} รายการจะใช้ราคาบูธเท่ากันทั้งหมด`,
        reasonLabel: mode === 'percent' ? 'ส่วนลด (%)' : 'ราคาบูธ (บาท)',
        reasonPlaceholder: mode === 'percent' ? 'เช่น 10' : 'เช่น 99',
        reasonRequired: true,
        confirmLabel: 'ตั้งราคา',
        tone: 'primary',
      })
      if (!ask.confirmed) return
      input = ask.value.trim()
      const num = parseFloat(input)
      if (!isFinite(num) || num < 0 || (mode === 'percent' && num > 100)) {
        toast.error(mode === 'percent' ? 'ใส่เป็นตัวเลข 0–100' : 'ใส่ราคาเป็นตัวเลขไม่ติดลบ')
        return
      }
    } else {
      const { confirmed } = await confirmDialog({
        title: 'ใช้ราคาปกติตอนออกบูธ?',
        message: `สินค้าที่เลือกไว้ ${n} รายการจะเลิกใช้ราคาบูธ กลับไปขายราคาเดียวกับหน้าร้าน`,
        confirmLabel: 'ล้างราคาบูธ',
        tone: 'primary',
      })
      if (!confirmed) return
    }

    setSaving(true)
    try {
      if (mode === 'clear') {
        await patchChunks(ids, { booth_price: null })
      } else if (mode === 'fixed') {
        await patchChunks(ids, { booth_price: parseFloat(input) })
      } else {
        const pct = parseFloat(input)
        const byPrice = new Map<number, string[]>()
        const pickedProducts = products.filter((p) => picked.has(p.id))
        for (const p of pickedProducts) {
          // ปัดเป็นสตางค์ก่อนเทียบ ไม่งั้น float ทำให้กลุ่มแตกเป็นเศษๆ
          const value = Math.round(p.price * (1 - pct / 100) * 100) / 100
          const group = byPrice.get(value)
          if (group) group.push(p.id)
          else byPrice.set(value, [p.id])
        }
        for (const [value, groupIds] of byPrice) await patchChunks(groupIds, { booth_price: value })
      }
    } catch (e) {
      setSaving(false)
      toast.error('ตั้งราคาไม่สำเร็จ: ' + (e as Error).message)
      return
    }
    setSaving(false)
    setPicked(new Set())
    toast.success(
      mode === 'clear' ? `ล้างราคาบูธ ${n} รายการแล้ว` : `ตั้งราคาบูธให้ ${n} รายการแล้ว`,
    )
    router.refresh()
  }

  const visible = found.slice(0, shown)
  const count = (n: number) => n.toLocaleString('th-TH')
  const allVisiblePicked = visible.length > 0 && visible.every((p) => picked.has(p.id))
  const emptyText = products.length === 0
    ? 'ยังไม่มีสินค้า — กด "เพิ่มสินค้า" เพื่อเริ่มต้น'
    : query
      ? `ไม่เจอสินค้าที่ตรงกับ "${query}"`
      : 'ไม่มีสินค้าที่ตรงกับตัวกรองนี้'

  /** ติ๊ก/ปลดทั้งชุดที่กำลังแสดงอยู่ */
  function toggleVisible() {
    const next = new Set(picked)
    if (allVisiblePicked) visible.forEach((p) => next.delete(p.id))
    else visible.forEach((p) => next.add(p.id))
    setPicked(next)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1 sm:min-w-64">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า / SKU / บาร์โค้ด / หมวด"
              className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            {query && (
              <button
                onClick={() => search('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="ล้างคำค้น"
              >
                <X size={15} />
              </button>
            )}
          </div>
          {/* กล้องตัวเดียวกับหน้าขาย — ยิงกล่องที่ถืออยู่แล้วเปิดสินค้าตัวนั้นแก้ได้เลย */}
          <button
            type="button"
            onClick={() => setScanning(true)}
            title="ยิงบาร์โค้ดเพื่อค้นหาสินค้า"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ScanLine size={16} />
            <span className="max-sm:sr-only">ยิงบาร์โค้ด</span>
          </button>
        </div>
        {/* จอเล็กให้สองตัวนี้อยู่แถวของมันเอง ไม่งั้นโดนบีบจนอ่านไม่ออกว่ากรองอะไรอยู่
            — sm:contents ทำให้ div นี้หายไปบนจอใหญ่ แถวเดิมจึงไม่เปลี่ยน */}
        <div className="flex w-full gap-3 sm:contents">
        <select
          value={vatFilter}
          onChange={(e) => { setVatFilter(e.target.value as '' | 'yes' | 'no'); setShown(PAGE) }}
          className="min-w-0 flex-1 sm:flex-none sm:shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">VAT: ทั้งหมด</option>
          <option value="yes">เฉพาะที่มี VAT</option>
          <option value="no">เฉพาะที่ไม่มี VAT</option>
        </select>
        <select
          value={boothFilter}
          onChange={(e) => { setBoothFilter(e.target.value as '' | 'yes' | 'no'); setShown(PAGE) }}
          className="min-w-0 flex-1 sm:flex-none sm:shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">ราคาบูธ: ทั้งหมด</option>
          <option value="yes">เฉพาะที่ตั้งราคาบูธไว้</option>
          <option value="no">เฉพาะที่ใช้ราคาปกติ</option>
        </select>
        </div>
        {stoppedCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
            <input
              type="checkbox"
              checked={hideStopped}
              onChange={(e) => { setHideStopped(e.target.checked); setShown(PAGE) }}
              className="w-4 h-4 accent-blue-600"
            />
            ซ่อนที่งดจำหน่าย ({count(stoppedCount)})
          </label>
        )}
        <p className="text-sm text-gray-500 shrink-0">
          {/* ตัวกรอง VAT กับ "ซ่อนที่งดจำหน่าย" ก็ต้องนับใหม่ ไม่ใช่โชว์ยอดเต็มค้างไว้จนดูเหมือนกรองไม่ติด */}
          {query || vatFilter || boothFilter || hideStopped ? (
            <>
              พบ <span className="font-semibold text-gray-900">{count(found.length)}</span> จาก{' '}
              {count(products.length)} รายการ
            </>
          ) : (
            <>ทั้งหมด {count(products.length)} รายการ</>
          )}
        </p>
      </div>

      {scanning && (
        <BarcodeScanner
          onDetect={handleScan}
          onClose={() => setScanning(false)}
          title="ยิงหาสินค้า"
          hint="จ่อบาร์โค้ดให้อยู่ในกรอบ — เจอแล้วจะปิดกล้องแล้วกรอกรหัสลงช่องค้นหาให้"
        />
      )}

      {picked.size > 0 && (
        <div className="sticky top-14 md:top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 md:px-4">
          <Receipt size={15} className="text-blue-600 shrink-0" />
          <span className="text-sm font-medium text-blue-900">
            เลือกไว้ {count(picked.size)} รายการ
          </span>
          {picked.size < found.length && (
            <button
              onClick={() => setPicked(new Set(found.map((p) => p.id)))}
              className="text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
            >
              เลือกทั้งหมดที่ค้นเจอ ({count(found.length)})
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => applyVat(true)}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              ตั้งเป็น มี VAT
            </button>
            <button
              onClick={() => applyVat(false)}
              disabled={saving}
              className="rounded-lg bg-gray-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40"
            >
              ตั้งเป็น ไม่มี VAT
            </button>
            <button
              onClick={() => applyVat(null)}
              disabled={saving}
              title="ลบค่าที่ตั้งรายตัว ให้ใช้ค่าของหมวดหมู่แทน"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              ใช้ตามหมวดหมู่
            </button>
            <span className="h-5 w-px bg-blue-200" aria-hidden />
            <button
              onClick={() => applyBoothPrice('percent')}
              disabled={saving}
              title="ราคาบูธ = ราคาปกติของแต่ละตัว หักส่วนลดที่กรอก"
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
            >
              ราคาบูธ: ลด %
            </button>
            <button
              onClick={() => applyBoothPrice('fixed')}
              disabled={saving}
              title="ตั้งราคาบูธเท่ากันทุกตัวที่เลือก"
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40"
            >
              ราคาบูธ: ตั้งเท่ากัน
            </button>
            <button
              onClick={() => applyBoothPrice('clear')}
              disabled={saving}
              title="เลิกใช้ราคาบูธ กลับไปขายราคาเดียวกับหน้าร้าน"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              ล้างราคาบูธ
            </button>
            <button
              onClick={() => setPicked(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              ล้างการเลือก
            </button>
          </div>
        </div>
      )}

      {/* จอเล็กใช้การ์ด — ตารางสิบคอลัมน์บีบจนชื่อสินค้าแตกเป็นคำละบรรทัด อ่านบนมือถือไม่ได้ */}
      <div className="md:hidden">
        {visible.length > 0 && (
          <label className="mb-2 flex items-center gap-2 px-1 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={allVisiblePicked}
              onChange={toggleVisible}
              className="h-4 w-4 accent-blue-600"
            />
            เลือกทั้งหมดที่แสดงอยู่ ({count(visible.length)})
          </label>
        )}
        <div className="space-y-2">
          {visible.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              selected={picked.has(product.id)}
              onToggle={() => toggleOne(product.id)}
            />
          ))}
        </div>
        {found.length === 0 && (
          <p className="rounded-xl border border-gray-100 bg-white px-4 py-10 text-center text-sm text-gray-400">
            {emptyText}
          </p>
        )}
      </div>

      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="pl-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allVisiblePicked}
                  onChange={toggleVisible}
                  aria-label="เลือกทั้งหมดในหน้านี้"
                  className="w-4 h-4 accent-blue-600"
                />
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">สินค้า</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">SKU</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">บาร์โค้ด</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">หมวด</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ราคา</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">คงเหลือ</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">งดจำหน่าย</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">ขายออนไลน์</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                selected={picked.has(product.id)}
                onToggle={() => toggleOne(product.id)}
              />
            ))}
            {found.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {found.length > visible.length && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setShown(shown + PAGE)}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg"
          >
            แสดงเพิ่ม {count(Math.min(PAGE, found.length - visible.length))} รายการ
          </button>
          <button
            onClick={() => setShown(found.length)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            แสดงทั้งหมด ({count(found.length)})
          </button>
        </div>
      )}
      {found.length > PAGE && found.length === visible.length && (
        <p className="text-center text-xs text-gray-400 mt-4">แสดงครบ {count(found.length)} รายการแล้ว</p>
      )}
    </>
  )
}
