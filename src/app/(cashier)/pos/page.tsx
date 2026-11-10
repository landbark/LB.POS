import { createClient } from '@/lib/supabase/server'
import { thaiToday } from '@/lib/thaiDate'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { isClinicOnly } from '@/lib/clinic'
import { PROMOTION_SELECT, toPromotion } from '@/lib/promotions'
import { PENDING_VISIT_SELECT, POS_PRODUCT_SELECT, toQueueVisits, type PendingVisitRow } from '@/lib/clinicQueue'
import POSClient from './POSClient'

export default async function POSPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [products, { data: promotions }, { data: pointsConfig }, { data: rewards }, { data: storeSettings }, { data: pendingVisits }, { data: boothTrip }, { data: openShift }, { data: profile }] = await Promise.all([
    // ไล่ดึงทีละหน้า — supabase ตัดที่ 1000 แถว ส่วนร้านมีสินค้าเกินนั้นแล้ว
    fetchAll((from, to) =>
      supabase
        .from('products')
        .select(POS_PRODUCT_SELECT)
        .eq('active', true)
        .order('name')
        .order('id')   // ชื่อสินค้าซ้ำได้ ต้องมีคีย์ไม่ซ้ำปิดท้าย ไม่งั้นแถวซ้ำ/หายระหว่างหน้า
        .range(from, to)
    ),
    // โปรที่ใช้ได้วันนี้ทั้งหน้าร้านและบูธ — หน้าขายกรองตามโหมดเองทีหลัง (โหมดบูธอยู่ฝั่ง client)
    // end_date ว่าง = ไม่มีวันหมด (โปรบูธที่ใช้ซ้ำทุกรอบ)
    supabase
      .from('promotions')
      .select(PROMOTION_SELECT)
      .eq('active', true)
      .lte('start_date', thaiToday())
      .or(`end_date.is.null,end_date.gte.${thaiToday()}`),
    supabase.from('points_config').select('*').limit(1).single(),
    // ของแลกแต้มที่เปิดใช้อยู่ — หน้าขายหาสินค้าตัวจริงจาก products ที่โหลดมาแล้ว
    supabase
      .from('rewards')
      .select('product_id, points_cost, max_per_bill, note')
      .eq('active', true)
      .order('sort_order'),
    supabase.from('store_settings').select('promptpay_id, rounding_mode').limit(1).single(),
    // คิวเก็บเงินจากคลินิก — หมอกด "ส่งไปเก็บเงิน" ที่หน้าตรวจรักษาแล้วมาโผล่ตรงนี้
    supabase
      .from('visits')
      .select(PENDING_VISIT_SELECT)
      .eq('status', 'pending_payment')
      .order('visit_date'),
    // รอบออกบูธที่เปิดอยู่ (มีได้ทีละรอบ) — มีรอบเปิดถึงจะกดโหมดบูธในหน้าขายได้
    supabase
      .from('booth_trips')
      .select('id, trip_number, name, location, booth_trip_items(product_id, taken_quantity)')
      .eq('status', 'open')
      .maybeSingle(),
    // กะที่เปิดอยู่ — ขายหน้าร้านตอนไม่มีกะเปิด เงินสดบิลนั้นจะไม่เข้าสูตร "เงินที่ควรมี" ของกะไหนเลย
    supabase.from('shifts').select('id, opened_at').is('closed_at', null).maybeSingle(),
    // ชื่อคนขาย — ใช้เขียน notes ของกะตอนเปิดกะจากหน้านี้
    supabase.from('profiles').select('name').eq('id', user?.id ?? '').maybeSingle(),
  ])

  // ปิดระบบแต้ม = ส่ง null ลงไป หน้าขายจะไม่คิด/ไม่ให้ใช้แต้มเลย (แต้มเดิมของลูกค้ายังอยู่)
  const activePointsConfig = pointsConfig?.enabled === false ? null : pointsConfig

  // ยา/เวชภัณฑ์ไม่ขายหน้าร้าน — หมอสั่งจ่ายจากหน้าตรวจรักษา แล้วส่งเข้าตะกร้ามาเก็บเงินแทน
  const shelfProducts = products.filter((p) => !isClinicOnly(p))

  // ผูกสินค้าเต็มก้อน (พร้อมล็อต) ให้รายการจากคลินิก เพราะยาถูกกรองออกจาก shelfProducts ไปแล้ว
  const productById = new Map(products.map((p) => [p.id, p]))
  const clinicQueue = toQueueVisits((pendingVisits ?? []) as unknown as PendingVisitRow[], productById)

  // โหมดบูธขายเฉพาะของที่ลงใบเบิกไว้ ส่งรายการ id ไปให้หน้าขายกรอง
  const booth = boothTrip
    ? {
        id: boothTrip.id,
        trip_number: boothTrip.trip_number,
        label: [boothTrip.name, boothTrip.location].filter(Boolean).join(' · ') || 'งานออกบูธ',
        productIds: (boothTrip.booth_trip_items ?? []).map((i: { product_id: string }) => i.product_id),
        // ไว้ขึ้นป้ายบอกคนที่ร้านว่าของตัวนี้ถูกยกไปงานกี่ชิ้น (สต็อกในระบบยังนับรวมอยู่)
        takenByProduct: Object.fromEntries(
          (boothTrip.booth_trip_items ?? []).map((i: { product_id: string; taken_quantity: number }) => [
            i.product_id,
            i.taken_quantity,
          ]),
        ) as Record<string, number>,
      }
    : null

  return (
    <POSClient
      products={shelfProducts}
      booth={booth}
      shiftOpen={Boolean(openShift)}
      shiftOpenedAt={openShift?.opened_at ?? null}
      promotions={(promotions ?? []).map((p) => toPromotion(p as never))}
      pointsConfig={activePointsConfig}
      rewards={activePointsConfig ? (rewards ?? []) : []}
      cashierId={user?.id ?? ''}
      cashierName={profile?.name ?? ''}
      promptpayId={storeSettings?.promptpay_id ?? null}
      roundingMode={storeSettings?.rounding_mode ?? 'none'}
      clinicQueue={clinicQueue}
    />
  )
}
