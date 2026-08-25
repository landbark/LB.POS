import { NextResponse, type NextRequest } from 'next/server'
import { getCustomerId } from '@/lib/customer-session'
import { priceCart } from '@/lib/order-pricing'
import { getShippingZones, getStorefront } from '@/lib/shop-data'
import { quoteShipping } from '@/lib/shop'
import { expireStaleOrders } from '@/lib/order-stock'
import { createAdminClient } from '@/lib/supabase/admin'

interface AddressInput {
  recipient_name?: string
  phone?: string
  address_line?: string
  subdistrict?: string
  district?: string
  province?: string
  postal_code?: string
}

export async function GET() {
  const customerId = await getCustomerId()
  if (!customerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('orders')
    .select('*, order_items(*)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ orders: data ?? [] })
}

// สร้างออเดอร์ — ยังไม่ตัดสต็อค (ตัดตอนพนักงานกดยืนยันในหน้า /admin/orders)
export async function POST(request: NextRequest) {
  const customerId = await getCustomerId()
  if (!customerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const store = await getStorefront()
  if (!store?.shop_enabled) {
    return NextResponse.json({ error: 'ร้านค้าออนไลน์ปิดรับออเดอร์ชั่วคราว' }, { status: 400 })
  }

  // ปล่อยออเดอร์ที่ค้างเกินกำหนดก่อน ของที่ถูกจองไว้จะได้กลับมาขายได้
  await expireStaleOrders()

  const body = await request.json()
  const priced = await priceCart(body.items ?? [])
  if (!priced.ok) return NextResponse.json({ error: priced.error }, { status: 400 })

  const fulfillment: 'delivery' | 'pickup' = body.fulfillment === 'pickup' ? 'pickup' : 'delivery'
  const admin = createAdminClient()

  let shippingFee = 0
  let zoneName: string | null = null
  let address: AddressInput = {}

  if (fulfillment === 'delivery') {
    if (priced.missingWeight.length > 0) {
      return NextResponse.json(
        { error: `"${priced.missingWeight.join('", "')}" ยังไม่ได้ตั้งน้ำหนัก — เลือกรับที่ร้านหรือติดต่อร้าน` },
        { status: 400 }
      )
    }

    if (body.addressId) {
      const { data: saved } = await admin
        .from('customer_addresses')
        .select('*')
        .eq('id', body.addressId)
        .eq('customer_id', customerId)
        .maybeSingle()
      if (!saved) return NextResponse.json({ error: 'ไม่พบที่อยู่จัดส่งที่เลือก' }, { status: 400 })
      address = saved
    } else {
      address = (body.address ?? {}) as AddressInput
    }

    const missing = !address.recipient_name?.trim() || !address.phone?.trim()
      || !address.address_line?.trim() || !address.province?.trim()
    if (missing) {
      return NextResponse.json({ error: 'กรอกที่อยู่จัดส่งให้ครบ (ชื่อผู้รับ / เบอร์โทร / ที่อยู่ / จังหวัด)' }, { status: 400 })
    }

    const zones = await getShippingZones()
    const quote = quoteShipping({
      zones,
      province: address.province!,
      weightGrams: priced.weightGrams,
      subtotal: priced.subtotal,
      freeShippingMin: store.free_shipping_min,
    })
    if (!quote.ok) return NextResponse.json({ error: quote.reason }, { status: 400 })

    shippingFee = quote.fee
    zoneName = quote.zoneName

    // เก็บที่อยู่ใหม่เข้าสมุดที่อยู่ให้ด้วย ถ้าลูกค้าติ๊กไว้
    if (!body.addressId && body.saveAddress) {
      await admin.from('customer_addresses').insert({
        customer_id: customerId,
        recipient_name: address.recipient_name!.trim(),
        phone: address.phone!.trim(),
        address_line: address.address_line!.trim(),
        subdistrict: address.subdistrict?.trim() || null,
        district: address.district?.trim() || null,
        province: address.province!.trim(),
        postal_code: address.postal_code?.trim() || null,
      })
    }
  }

  const total = priced.subtotal + shippingFee

  // เลขที่ ONddmmyyyy+4 หลัก — ถ้าชนกัน (สั่งพร้อมกัน) ลองใหม่อีกรอบ
  let order: { id: string; order_number: string } | null = null
  let lastError: string | undefined
  for (let attempt = 0; attempt < 3 && !order; attempt++) {
    const { data: orderNumber, error: numberError } = await admin.rpc('next_order_number')
    if (numberError || !orderNumber) {
      return NextResponse.json({ error: numberError?.message ?? 'สร้างเลขที่ออเดอร์ไม่สำเร็จ' }, { status: 500 })
    }

    const { data, error } = await admin
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        status: 'pending_payment',
        fulfillment,
        subtotal: priced.subtotal,
        shipping_fee: shippingFee,
        total,
        total_weight_grams: priced.weightGrams,
        recipient_name: address.recipient_name?.trim() ?? null,
        phone: address.phone?.trim() ?? null,
        address_line: address.address_line?.trim() ?? null,
        subdistrict: address.subdistrict?.trim() || null,
        district: address.district?.trim() || null,
        province: address.province?.trim() ?? null,
        postal_code: address.postal_code?.trim() || null,
        shipping_zone_name: zoneName,
        customer_note: String(body.note ?? '').trim() || null,
      })
      .select('id, order_number')
      .single()

    if (data) order = data
    else {
      lastError = error?.message
      if (error?.code !== '23505') break
    }
  }

  if (!order) return NextResponse.json({ error: lastError ?? 'สั่งซื้อไม่สำเร็จ' }, { status: 500 })

  const { error: itemsError } = await admin.from('order_items').insert(
    priced.lines.map((line) => ({ ...line, order_id: order.id }))
  )
  if (itemsError) {
    // ออเดอร์เปล่าไม่มีประโยชน์ — ลบทิ้งแล้วให้ลูกค้าลองใหม่
    await admin.from('orders').delete().eq('id', order.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  return NextResponse.json({ id: order.id, order_number: order.order_number })
}
