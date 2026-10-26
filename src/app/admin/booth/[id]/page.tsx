import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { sumByMethod, type PaidTransaction } from '@/lib/payments'
import { thaiToday } from '@/lib/thaiDate'
import { PROMOTION_SELECT, describePromotion, toPromotion } from '@/lib/promotions'
import type { BoothTrip, BoothTripItem } from '@/lib/types'
import BoothTripClient, { type SoldLine, type PickerProduct, type BoothPromo } from './BoothTripClient'

interface SoldRow {
  product_id: string | null
  /** จำนวนหน่วยฐานที่ขายได้ (ขายยกกล่องถูกคูณมาแล้ว) — เทียบกับของที่เบิกไปซึ่งนับเป็นหน่วยฐาน */
  base_quantity: number
  subtotal: number
  products: { name: string; unit: string; cost: number | null } | null
}

export default async function BoothTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: trip }, { data: profile }] = await Promise.all([
    supabase
      .from('booth_trips')
      .select(`
        *,
        opener:profiles!booth_trips_opened_by_fkey(name),
        closer:profiles!booth_trips_closed_by_fkey(name)
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle(),
  ])

  if (!trip) notFound()

  const today = thaiToday()

  const [{ data: items }, soldRows, { data: txs }, products, { data: promoRows }] = await Promise.all([
    supabase
      .from('booth_trip_items')
      .select('*, products(id, name, sku, unit, price, booth_price, cost)')
      .eq('trip_id', id)
      .order('created_at'),
    // ขายได้เท่าไรต่อสินค้า — บิลที่ยกเลิกไปแล้วไม่นับ ของกลับเข้าสต็อกตั้งแต่ตอนยกเลิกแล้ว
    fetchAll<SoldRow>((from, to) =>
      supabase
        .from('transaction_items')
        .select('product_id, base_quantity, subtotal, products(name, unit, cost), transactions!inner(booth_trip_id, status)')
        .eq('transactions.booth_trip_id', id)
        .eq('transactions.status', 'completed')
        .order('id')
        // relation many-to-one ที่ join มา PostgREST type ให้เป็น array — cast เหมือนหน้าอื่นในระบบ
        .range(from, to) as never,
    ),
    supabase
      .from('transactions')
      .select('total, payment_method, transaction_payments(method, amount)')
      .eq('booth_trip_id', id)
      .eq('status', 'completed'),
    // ของทั้งร้านไว้เลือกลงใบเบิก — ร้านมีสองพันกว่าตัว ต้องไล่ดึงทีละหน้า
    fetchAll<PickerProduct>((from, to) =>
      supabase
        .from('products')
        .select('id, name, sku, barcode, unit, cost, price, booth_price, supplier_id, product_lots(quantity)')
        .eq('active', true)
        .eq('is_service', false)
        .order('name')
        .order('id')
        .range(from, to),
    ),
    // โปรที่หน้าขายจะลดให้ตอนเปิดโหมดบูธ — เอาไว้เช็คก่อนยกของไป ไม่ได้ผูกกับรอบนี้
    // รอบที่ปิดแล้วไม่ต้องดึง โปรของวันนี้ไม่ได้บอกอะไรเกี่ยวกับงานที่จบไปแล้ว
    trip.status === 'open'
      ? supabase
          .from('promotions')
          .select(PROMOTION_SELECT)
          .eq('active', true)
          .in('channel_scope', ['all', 'booth'])
          .lte('start_date', today)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  // สินค้าที่ขายได้ในรอบนี้ — รวมตัวที่ไม่ได้อยู่ในใบเบิกด้วย (หยิบเพิ่มทีหลัง/ลืมลงใบ)
  const sold = new Map<string, SoldLine>()
  for (const row of soldRows) {
    if (!row.product_id) continue
    const product = row.products as unknown as { name: string; unit: string; cost: number | null } | null
    const at = sold.get(row.product_id) ?? {
      quantity: 0,
      revenue: 0,
      name: product?.name ?? 'สินค้าที่ถูกลบแล้ว',
      unit: product?.unit ?? '',
      cost: product?.cost ?? null,
    }
    at.quantity += row.base_quantity
    at.revenue += Number(row.subtotal)
    sold.set(row.product_id, at)
  }

  const bills = (txs ?? []) as PaidTransaction[]

  // สรุปขอบเขตเป็นจำนวน ไม่ไปดึงชื่อสินค้า/หมวดเพิ่ม — แผงนี้ไว้เตือนความจำ กดเข้าไปดูของจริงได้
  const promos: BoothPromo[] = (promoRows ?? []).map((row) => {
    const p = toPromotion(row as never)
    return {
      id: p.id,
      name: p.name,
      detail: describePromotion(p),
      scope: p.apply_to === 'all'
        ? 'ทุกสินค้า'
        : p.apply_to === 'categories'
          ? `เฉพาะ ${p.category_ids.length} หมวด`
          : `เฉพาะ ${p.product_ids.length} รายการ`,
      boothOnly: p.channel_scope === 'booth',
    }
  })

  return (
    <BoothTripClient
      trip={trip as unknown as BoothTrip}
      items={(items ?? []) as unknown as BoothTripItem[]}
      sold={Object.fromEntries(sold)}
      products={products}
      promos={promos}
      billCount={bills.length}
      salesTotal={bills.reduce((s, t) => s + Number(t.total), 0)}
      byMethod={sumByMethod(bills)}
      userId={user?.id ?? ''}
      canSeeCost={profile?.role === 'admin'}
    />
  )
}
