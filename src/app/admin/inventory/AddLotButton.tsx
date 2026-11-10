'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, Search, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import DateField from '@/components/DateField'

/**
 * เพิ่มล็อตใหม่ได้จากหน้าสต็อค — เดิมต้องเข้าหน้าสินค้าตัวนั้นก่อนถึงจะกด "เพิ่ม lot" ได้
 *
 * ค้นสินค้าจาก server ทีละคำค้น (ร้านมีสินค้าเกินพันตัว โหลดมาทั้งตารางเพื่อค้นในเบราว์เซอร์
 * แพงเกินไป) — ค่าบริการ/ค่าตรวจไม่มีสต็อคให้เก็บ จึงไม่เอามาให้เลือก
 */

const DEBOUNCE_MS = 300
const MAX_RESULTS = 20
/** สั้นกว่านี้ยังไม่ค้น — คำสองตัวอักษรกวาดมาเกือบทั้งร้าน */
const MIN_CHARS = 2

interface Hit {
  id: string
  name: string
  sku: string | null
  unit: string
}

/** ผลค้นหาผูกกับคำค้นที่ขอไว้ — ผลที่กลับมาช้ากว่าคำค้นปัจจุบันจะไม่ถูกนำมาแสดง */
interface SearchResult {
  term: string
  hits: Hit[]
  failed: boolean
}

export default function AddLotButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [picked, setPicked] = useState<Hit | null>(null)

  const [lotNo, setLotNo] = useState('')
  const [expiry, setExpiry] = useState('')
  const [qty, setQty] = useState('')

  const term = query.trim()
  const canSearch = term.length >= MIN_CHARS
  // ผลที่ตรงกับคำค้นที่พิมพ์อยู่ตอนนี้เท่านั้น — ของคำค้นก่อนหน้าถือว่าไม่มี
  const current = result?.term === term ? result : null
  const hits = current?.hits ?? []
  const searching = canSearch && !current

  useEffect(() => {
    if (!canSearch || current) return

    const timer = setTimeout(async () => {
      const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
      const { data, error } = await createClient()
        .from('products')
        .select('id, name, sku, unit')
        .eq('active', true)
        // ค่าบริการ/ค่าตรวจขายได้แต่ไม่มีสต็อคให้เก็บ และตัวที่ถูกยุบเป็นหน่วยของสินค้าอื่นแล้วก็ไม่ใช่สินค้าจริง
        .eq('is_service', false)
        .is('replaced_by_unit_id', null)
        .or(`name.ilike.${like},sku.ilike.${like},barcode.ilike.${like}`)
        .order('name')
        .limit(MAX_RESULTS)

      if (error) toast.error('ค้นสินค้าไม่สำเร็จ: ' + error.message)
      setResult({ term, hits: data ?? [], failed: !!error })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [term, canSearch, current])

  function openModal() {
    setQuery('')
    setResult(null)
    setPicked(null)
    setLotNo('')
    setExpiry('')
    setQty('')
    setOpen(true)
  }

  const amount = parseInt(qty, 10)
  const validQty = !isNaN(amount) && amount > 0

  async function save() {
    if (!picked) return
    if (!validQty) {
      toast.error('ใส่จำนวนตั้งแต่ 1 ขึ้นไป')
      return
    }

    setBusy(true)
    const supabase = createClient()

    const { data: lot, error } = await supabase
      .from('product_lots')
      .insert({
        product_id: picked.id,
        lot_number: lotNo.trim() || null,
        expiry_date: expiry || null,
        quantity: amount,
        initial_quantity: amount,
      })
      .select('id')
      .single()

    if (error || !lot) {
      toast.error('เพิ่มล็อตไม่สำเร็จ' + (error ? ': ' + error.message : ''))
      setBusy(false)
      return
    }

    const { error: logErr } = await supabase.from('stock_movements').insert({
      product_id: picked.id,
      product_lot_id: lot.id,
      type: 'adjust_in',
      quantity: amount,
      reason: `เพิ่ม lot ใหม่${lotNo.trim() ? ` (${lotNo.trim()})` : ''}`,
      created_by: userId || null,
    })
    // ของเข้าสต็อคแล้ว แต่ประวัติหาย — บอกให้รู้ ไม่ใช่เงียบ
    if (logErr) toast.error('เพิ่มล็อตแล้ว แต่บันทึกประวัติไม่สำเร็จ: ' + logErr.message)
    else toast.success(`เพิ่ม ${amount} ${picked.unit} เข้า ${picked.name}`)

    setBusy(false)
    setOpen(false)
    router.refresh()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg shrink-0"
      >
        <Plus size={15} /> เพิ่มล็อต
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 min-w-0">
                {picked && (
                  <button
                    onClick={() => setPicked(null)}
                    className="text-gray-400 hover:text-gray-600 shrink-0"
                    title="เลือกสินค้าอื่น"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}
                <div className="min-w-0">
                  <h2 className="font-bold text-gray-900 text-sm truncate">
                    {picked ? picked.name : 'เพิ่มล็อตใหม่'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {picked ? picked.sku || 'ไม่มี SKU' : 'เลือกสินค้าที่จะรับของเข้า'}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={20} />
              </button>
            </div>

            {!picked ? (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="shrink-0 p-4 pb-2">
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="ชื่อสินค้า / SKU / บาร์โค้ด"
                      className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2 text-sm"
                      autoFocus
                    />
                    {searching && (
                      <Loader2
                        size={15}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin"
                      />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
                  {!canSearch ? (
                    <p className="text-sm text-gray-400 text-center py-8">พิมพ์อย่างน้อย {MIN_CHARS} ตัวอักษร</p>
                  ) : current?.failed ? (
                    <p className="text-sm text-red-500 text-center py-8">ค้นไม่สำเร็จ — ลองพิมพ์อีกครั้ง</p>
                  ) : !searching && hits.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">ไม่พบสินค้า</p>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {hits.map((h) => (
                        <li key={h.id}>
                          <button
                            onClick={() => setPicked(h)}
                            className="w-full text-left py-2.5 hover:bg-gray-50 rounded px-2 -mx-2"
                          >
                            <p className="text-sm font-medium text-gray-900">{h.name}</p>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                              {h.sku || 'ไม่มี SKU'} · {h.unit}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      จำนวน ({picked.unit}) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      className={inputClass}
                      placeholder="0"
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">เลข LOT</label>
                      <input
                        type="text"
                        value={lotNo}
                        onChange={(e) => setLotNo(e.target.value)}
                        className={inputClass}
                        placeholder="ไม่ระบุ"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">วันหมดอายุ</label>
                      <DateField value={expiry} onChange={setExpiry} className={inputClass} aria-label="วันหมดอายุ" />
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">
                    จะลงใน “ประวัติสต็อค” เป็นปรับเพิ่มพร้อมชื่อคนทำ — ของที่ซื้อเข้าร้านตามใบสั่งซื้อ
                    ควรรับผ่านเมนู “เอกสาร” เพื่อให้ต้นทุนเข้าระบบด้วย
                  </p>
                </div>

                <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-gray-100">
                  <button
                    onClick={save}
                    disabled={busy || !validQty}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2.5 rounded-lg font-medium disabled:opacity-50"
                  >
                    {busy && <Loader2 size={15} className="animate-spin" />}
                    {busy ? 'บันทึก...' : 'เพิ่มล็อต'}
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                  >
                    ยกเลิก
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
