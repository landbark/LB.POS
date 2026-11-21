import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MemberCardView from './MemberCardView'

// id = customerId — บัตรสมาชิกสำหรับพิมพ์ ขนาดเดียวกับฉลากยา (80 × 50 มม.)
// ใช้เครื่องพิมพ์ฉลากตัวเดิมที่ร้านมีอยู่แล้ว ลอกแปะหลังมือถือ/ใส่กระเป๋าสตางค์ได้
export default async function MemberCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: customer }, { data: store }] = await Promise.all([
    supabase.from('customers').select('id, full_name, hn, phone').eq('id', id).single(),
    supabase.from('store_settings').select('name, phone').limit(1).single(),
  ])
  if (!customer) notFound()

  return (
    <MemberCardView
      customer={customer as { id: string; full_name: string; hn: string | null; phone: string }}
      store={store as { name: string; phone: string | null } | null}
    />
  )
}
