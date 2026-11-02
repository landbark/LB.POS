import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PurchasePrintView from './PurchasePrintView'
import type { Metadata } from 'next'

// ชื่อไฟล์ตอน "บันทึกเป็น PDF" มาจาก <title> ของหน้า
// Next แทรก metadata ลงหน้าทีหลัง (streaming metadata) เลยไปทับ document.title
// ที่ PrintToolbar ตั้งไว้ตอน hydrate — ต้องตั้งชื่อจากฝั่งเซิร์ฟเวอร์ตรงนี้ด้วย
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('purchases').select('purchase_number').eq('id', id).single()

  return { title: data ? `LB_${data.purchase_number}` : 'ใบสั่งซื้อ' }
}

export default async function PurchasePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: purchase }, { data: store }] = await Promise.all([
    supabase
      .from('purchases')
      .select(`
        id, purchase_number, notes, status, created_at,
        suppliers(name, contact_name, phone, address),
        purchase_items(quantity, unit_cost, unit_name, unit_factor, base_quantity, products(name, sku, unit))
      `)
      .eq('id', id)
      .single(),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])

  if (!purchase) notFound()

  return <PurchasePrintView purchase={purchase as never} store={store} />
}
