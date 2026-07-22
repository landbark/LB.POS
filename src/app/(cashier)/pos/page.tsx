import { createClient } from '@/lib/supabase/server'
import { isClinicOnly } from '@/lib/clinic'
import type { ClinicQueueItem, Customer } from '@/lib/types'
import POSClient from './POSClient'

export default async function POSPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: products }, { data: promotions }, { data: pointsConfig }, { data: storeSettings }, { data: pendingVisits }] = await Promise.all([
    supabase
      .from('products')
      .select(`
        *,
        categories(name, vat_applicable, clinic_only),
        product_lots(id, quantity, expiry_date, lot_number)
      `)
      .eq('active', true)
      .order('name'),
    supabase
      .from('promotions')
      .select('*')
      .eq('active', true)
      .lte('start_date', new Date().toISOString().split('T')[0])
      .gte('end_date', new Date().toISOString().split('T')[0]),
    supabase.from('points_config').select('*').limit(1).single(),
    supabase.from('store_settings').select('promptpay_id').limit(1).single(),
    // คิวเก็บเงินจากคลินิก — หมอกด "ส่งไปเก็บเงิน" ที่หน้าตรวจรักษาแล้วมาโผล่ตรงนี้
    supabase
      .from('visits')
      .select('id, visit_number, pets(name), customers(*), visit_items(id, product_id, quantity, unit_price, dosage)')
      .eq('status', 'pending_payment')
      .order('visit_date'),
  ])

  // ปิดระบบแต้ม = ส่ง null ลงไป หน้าขายจะไม่คิด/ไม่ให้ใช้แต้มเลย (แต้มเดิมของลูกค้ายังอยู่)
  const activePointsConfig = pointsConfig?.enabled === false ? null : pointsConfig

  // ยา/เวชภัณฑ์ไม่ขายหน้าร้าน — หมอสั่งจ่ายจากหน้าตรวจรักษา แล้วส่งเข้าตะกร้ามาเก็บเงินแทน
  const shelfProducts = (products ?? []).filter((p) => !isClinicOnly(p))

  // ผูกสินค้าเต็มก้อน (พร้อมล็อต) ให้รายการจากคลินิก เพราะยาถูกกรองออกจาก shelfProducts ไปแล้ว
  const productById = new Map((products ?? []).map((p) => [p.id, p]))
  const clinicQueue = (pendingVisits ?? []).map((v) => ({
    id: v.id,
    visit_number: v.visit_number,
    pet_name: (v.pets as unknown as { name: string } | null)?.name ?? '',
    customer: (v.customers as unknown as Customer | null) ?? null,
    items: (v.visit_items ?? [])
      .map((item) => ({
        quantity: item.quantity,
        unit_price: item.unit_price,
        dosage: item.dosage,
        product: item.product_id ? productById.get(item.product_id) : undefined,
      }))
      // สินค้าถูกลบทีหลัง = ข้ามไป ให้แคชเชียร์เก็บรายการที่เหลือได้
      .filter((item): item is ClinicQueueItem => Boolean(item.product)),
  }))

  return (
    <POSClient
      products={shelfProducts}
      promotions={promotions ?? []}
      pointsConfig={activePointsConfig}
      cashierId={user?.id ?? ''}
      promptpayId={storeSettings?.promptpay_id ?? null}
      clinicQueue={clinicQueue}
    />
  )
}
