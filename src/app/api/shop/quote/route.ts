import { NextResponse, type NextRequest } from 'next/server'
import { priceCart } from '@/lib/order-pricing'
import { getShippingZones, getStorefront } from '@/lib/shop-data'
import { quoteShipping } from '@/lib/shop'

// คิดยอดรวม + ค่าส่งให้หน้าชำระเงิน (คิดใหม่ฝั่ง server ทุกครั้ง)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const priced = await priceCart(body.items ?? [])
  if (!priced.ok) return NextResponse.json({ error: priced.error }, { status: 400 })

  const fulfillment = body.fulfillment === 'pickup' ? 'pickup' : 'delivery'

  if (fulfillment === 'pickup') {
    return NextResponse.json({
      subtotal: priced.subtotal,
      weightGrams: priced.weightGrams,
      shippingFee: 0,
      total: priced.subtotal,
    })
  }

  // สินค้าไม่มีน้ำหนัก = คิดค่าส่งไม่ได้ (ไม่งั้นจะคิดค่าส่งต่ำกว่าจริงเงียบๆ)
  if (priced.missingWeight.length > 0) {
    return NextResponse.json({
      subtotal: priced.subtotal,
      weightGrams: priced.weightGrams,
      shippingFee: null,
      total: null,
      shippingError: `"${priced.missingWeight.join('", "')}" ยังไม่ได้ตั้งน้ำหนัก — เลือกรับที่ร้านหรือติดต่อร้านเพื่อสั่งจัดส่ง`,
    })
  }

  const province = String(body.province ?? '').trim()
  if (!province) {
    return NextResponse.json({
      subtotal: priced.subtotal,
      weightGrams: priced.weightGrams,
      shippingFee: null,
      total: null,
      shippingError: 'เลือกจังหวัดเพื่อคิดค่าส่ง',
    })
  }

  const [zones, store] = await Promise.all([getShippingZones(), getStorefront()])
  const quote = quoteShipping({
    zones,
    province,
    weightGrams: priced.weightGrams,
    subtotal: priced.subtotal,
    freeShippingMin: store?.free_shipping_min ?? null,
  })

  if (!quote.ok) {
    return NextResponse.json({
      subtotal: priced.subtotal,
      weightGrams: priced.weightGrams,
      shippingFee: null,
      total: null,
      shippingError: quote.reason,
    })
  }

  return NextResponse.json({
    subtotal: priced.subtotal,
    weightGrams: priced.weightGrams,
    shippingFee: quote.fee,
    zoneName: quote.zoneName,
    freeShipping: quote.free,
    total: priced.subtotal + quote.fee,
  })
}
