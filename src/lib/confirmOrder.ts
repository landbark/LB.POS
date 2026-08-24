import { createClient } from '@/lib/supabase/client'
import { isVatApplicable } from '@/lib/vat'
import type { Order } from '@/lib/types'

// ยืนยันออเดอร์ออนไลน์ = ตัดสต็อค (FEFO) + สร้างบิลขายให้เข้ารายงาน/แต้มสะสม
// ทำฝั่ง client เหมือน cancelReceipt.ts — RLS เปิดให้พนักงานที่ล็อกอินเขียนตารางเหล่านี้อยู่แล้ว
//
// หมายเหตุ: ยอดในบิล = ค่าสินค้าเท่านั้น ไม่รวมค่าส่ง (ค่าส่งเป็นค่าขนส่ง ไม่ใช่ยอดขายสินค้า)
// ค่าส่งยังอยู่ในออเดอร์และในหน้า /admin/orders

interface LotRow {
  id: string
  quantity: number
  expiry_date: string | null
}

export async function confirmOrder(order: Order, userId: string): Promise<{ error?: string }> {
  const supabase = createClient()

  const items = order.order_items ?? []
  if (items.length === 0) return { error: 'ออเดอร์นี้ไม่มีรายการสินค้า' }
  if (items.some((i) => !i.product_id)) {
    return { error: 'มีสินค้าในออเดอร์ที่ถูกลบออกจากระบบแล้ว — ยกเลิกออเดอร์แล้วให้ลูกค้าสั่งใหม่' }
  }

  const productIds = items.map((i) => i.product_id!) as string[]
  const { data: products, error: productError } = await supabase
    .from('products')
    .select('id, name, unit, is_service, vat_applicable, categories(vat_applicable), product_lots(id, quantity, expiry_date)')
    .in('id', productIds)

  if (productError) return { error: productError.message }

  // เช็คสต็อคให้ครบก่อน แล้วค่อยเขียนอะไร (กันตัดครึ่งๆ กลางๆ)
  const shortages: string[] = []
  for (const item of items) {
    const product = products?.find((p) => p.id === item.product_id)
    if (!product) return { error: `ไม่พบสินค้า "${item.product_name}" ในระบบแล้ว` }
    if (product.is_service) continue
    const stock = ((product.product_lots ?? []) as LotRow[]).reduce((sum, lot) => sum + lot.quantity, 0)
    if (stock < item.quantity) shortages.push(`${item.product_name} (ต้องการ ${item.quantity} มี ${stock})`)
  }
  if (shortages.length > 0) return { error: 'สต็อคไม่พอ: ' + shortages.join(', ') }

  // แต้มสะสม (ถ้าเปิดใช้อยู่)
  const [{ data: pointsConfig }, { data: customer }] = await Promise.all([
    supabase.from('points_config').select('*').limit(1).maybeSingle(),
    order.customer_id
      ? supabase.from('customers').select('id, points, total_spent').eq('id', order.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const goodsTotal = Number(order.subtotal)
  const earnedPoints = pointsConfig?.enabled && goodsTotal > 0
    ? Math.floor(goodsTotal / pointsConfig.spend_amount) * pointsConfig.earn_points
    : 0

  // เลขที่บิล — ชนกันได้ถ้ามีการขายพร้อมกัน ลองใหม่อีกรอบ
  let tx: { id: string; transaction_number: string } | null = null
  let lastError: string | undefined
  for (let attempt = 0; attempt < 3 && !tx; attempt++) {
    const { data: txNumber, error: numberError } = await supabase.rpc('next_transaction_number')
    if (numberError || !txNumber) return { error: numberError?.message ?? 'สร้างเลขที่บิลไม่สำเร็จ' }

    const shippingNote = Number(order.shipping_fee) > 0
      ? ` (ค่าส่ง ฿${Number(order.shipping_fee).toFixed(2)} เก็บแยก ไม่รวมในยอดบิล)`
      : ''

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        transaction_number: txNumber,
        cashier_id: userId,
        customer_id: order.customer_id,
        subtotal: goodsTotal,
        discount: 0,
        total: goodsTotal,
        payment_method: 'transfer',
        points_earned: earnedPoints,
        points_used: 0,
        notes: `ออเดอร์ออนไลน์ ${order.order_number}${shippingNote}`,
      })
      .select('id, transaction_number')
      .single()

    if (data) tx = data
    else {
      lastError = error?.message
      if (error?.code !== '23505') break
    }
  }
  if (!tx) return { error: lastError ?? 'สร้างบิลไม่สำเร็จ' }

  const { error: itemsError } = await supabase.from('transaction_items').insert(
    items.map((item) => {
      const product = products?.find((p) => p.id === item.product_id)
      return {
        transaction_id: tx.id,
        product_id: item.product_id,
        product_lot_id: null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: 0,
        subtotal: item.subtotal,
        vat_applicable: product ? isVatApplicable(product as never) : false,
      }
    })
  )
  if (itemsError) return { error: itemsError.message }

  // ตัดสต็อคแบบ FEFO (ล็อตใกล้หมดอายุก่อน) เหมือนหน้าขาย
  for (const item of items) {
    const product = products?.find((p) => p.id === item.product_id)
    if (!product || product.is_service) continue

    let remaining = item.quantity
    const lots = ((product.product_lots ?? []) as LotRow[])
      .filter((lot) => lot.quantity > 0)
      .sort((a, b) => {
        if (!a.expiry_date) return 1
        if (!b.expiry_date) return -1
        return a.expiry_date.localeCompare(b.expiry_date)
      })

    for (const lot of lots) {
      if (remaining <= 0) break
      const deduct = Math.min(remaining, lot.quantity)
      await supabase.from('product_lots').update({ quantity: lot.quantity - deduct }).eq('id', lot.id)
      await supabase.from('stock_movements').insert({
        product_id: item.product_id,
        product_lot_id: lot.id,
        transaction_id: tx.id,
        type: 'sale',
        quantity: deduct,
        reason: tx.transaction_number,
        created_by: userId,
      })
      remaining -= deduct
    }
  }

  if (customer) {
    await supabase
      .from('customers')
      .update({
        points: customer.points + earnedPoints,
        total_spent: Number(customer.total_spent) + goodsTotal,
      })
      .eq('id', customer.id)
  }

  const { error: orderError } = await supabase
    .from('orders')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: userId,
      transaction_id: tx.id,
    })
    .eq('id', order.id)

  if (orderError) return { error: orderError.message }
  return {}
}
