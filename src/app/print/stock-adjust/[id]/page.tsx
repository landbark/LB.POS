import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { groupAdjustDocs, type AdjustRow } from '@/lib/stockMovements'
import StockAdjustPrintView from './StockAdjustPrintView'

/**
 * ค้นหาแถวพี่น้องของใบเดียวกัน — กว้างกว่า DOC_GAP_MS เผื่อใบที่มีของหลายสิบรายการ
 * แล้วปล่อยให้ groupAdjustDocs ตัดกลุ่มตามช่วงห่างจริง
 */
const WINDOW_MS = 60 * 60_000

/** หาแถวทั้งใบจากไอดีของแถวใดแถวหนึ่ง — ใบตัดสต็อกไม่มีเลขที่ใน DB ต้องจับกลุ่มใหม่ทุกครั้ง */
async function loadDoc(id: string) {
  const supabase = await createClient()
  const columns = 'id, created_at, type, quantity, reason, product_id, products!inner(name, sku, unit), profiles(name)'

  const [{ data: anchor }, { data: store }] = await Promise.all([
    supabase.from('stock_movements').select(`${columns}, created_by`).eq('id', id).maybeSingle(),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])
  if (!anchor) return null

  const t = new Date(anchor.created_at).getTime()
  let siblings = supabase
    .from('stock_movements')
    .select(columns)
    .eq('type', anchor.type)
    .gte('created_at', new Date(t - WINDOW_MS).toISOString())
    .lte('created_at', new Date(t + WINDOW_MS).toISOString())
    .limit(500)
  // .eq() กับ null ใช้ไม่ได้ใน PostgREST — ต้องใช้ .is()
  siblings = anchor.reason === null ? siblings.is('reason', null) : siblings.eq('reason', anchor.reason)
  siblings = anchor.created_by === null ? siblings.is('created_by', null) : siblings.eq('created_by', anchor.created_by)

  const { data: rows } = await siblings.order('created_at', { ascending: false })

  const docs = groupAdjustDocs((rows ?? []) as unknown as AdjustRow[])
  const doc = docs.find((d) => d.rows.some((r) => r.id === id))
  return doc ? { doc, store } : null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const found = await loadDoc(id)
  if (!found) return { title: 'ใบตัดสต็อก' }
  // ชื่อไฟล์ตอน "บันทึกเป็น PDF" มาจาก <title> ของหน้า (ดู PrintToolbar)
  const stamp = new Date(found.doc.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).replace(/-/g, '')
  return { title: `LB_ADJ${stamp}_${found.doc.id.slice(0, 6).toUpperCase()}` }
}

export default async function StockAdjustPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const found = await loadDoc(id)
  if (!found) notFound()

  return <StockAdjustPrintView doc={found.doc} store={found.store} />
}
