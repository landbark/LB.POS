import type { SupabaseClient } from '@supabase/supabase-js'
import { deductStock } from '@/lib/deductStock'
import { isPlatformChannel } from '@/lib/salesChannel'
import { isVatApplicable } from '@/lib/vat'
import { earnedPointsFor } from '@/lib/points'
import type { CartItem, PaymentMethod, PointsConfig, RefundMethod, TransactionStatus } from '@/lib/types'

/**
 * รับคืน / เปลี่ยนสินค้า "บางรายการ" จากบิลเดิม
 *
 * ของเดิมมีแต่ยกเลิกใบเสร็จทั้งใบ ซึ่งผิดกับเคสที่เจอจริงที่สุด — ลูกค้าเอาของกลับมา
 * เปลี่ยนตัวเดียวจากบิลที่มีห้ารายการ แล้วเติมเงินส่วนต่าง ยกเลิกทั้งใบทำให้ยอดขาย
 * ของวันที่ขายหายไปทั้งบิล ทั้งที่อีกสี่รายการลูกค้าเอาไปแล้ว และถ้าบิลข้ามเดือนไปแล้ว
 * VAT ของเดือนนั้นก็เปลี่ยนย้อนหลังด้วย
 *
 * ใบคืนไม่แตะบิลเดิมเลย: บิลเดิมยังสมบูรณ์ ยอดวันนั้นไม่ขยับ แล้วมูลค่าของที่รับคืน
 * เอาไปทำได้สองทาง — หักกับบิลใหม่ (เปลี่ยนสินค้า) หรือคืนเป็นเงินสด/โอน/เครดิต
 */

/** มูลค่าที่คืนคิดตาม "เงินที่ลูกค้าจ่ายจริง" ไม่ใช่ราคาป้าย — บิลที่ลดท้ายบิลต้องคืนตามสัดส่วน */
export interface ReturnableItem {
  /** transaction_items.id ของบิลเดิม */
  id: string
  product_id: string | null
  name: string
  sku: string | null
  /** หน่วยที่ขาย (null = หน่วยฐาน) */
  unit_name: string | null
  unit_factor: number
  /** ชื่อหน่วยฐานของสินค้า — ใช้แสดงเมื่อขายเป็นหน่วยฐาน */
  base_unit: string
  /** จำนวนที่ขายไป (ในหน่วยที่ขาย) */
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
  is_reward: boolean
  /** แต้มที่จ่ายไปกับของแลกบรรทัดนี้ (รวมทุกหน่วย) */
  reward_points: number
  /** คืนไปแล้วกี่หน่วยจากใบคืนก่อนหน้า */
  returned: number
  /** คืนได้อีกกี่หน่วย */
  remaining: number
}

export interface ReturnableBill {
  id: string
  transaction_number: string
  /** วันที่ขายจริง */
  created_at: string
  status: TransactionStatus
  customer_id: string | null
  customer_name: string | null
  customer_points: number
  customer_credit: number
  total: number
  credit_used: number
  return_credit: number
  points_earned: number
  points_used: number
  /** ผลรวม subtotal ของทุกบรรทัด (ราคาหลังส่วนลดรายบรรทัด ก่อนลดท้ายบิล) */
  items_total: number
  /** มูลค่าที่ลูกค้าจ่ายจริงทั้งบิล = เงิน + เครดิต + ของที่เคยคืนมาหัก */
  net_paid: number
  /**
   * ตัวคูณแปลง "ราคาในบรรทัด" → "เงินที่ลูกค้าจ่ายจริงต่อบรรทัดนั้น"
   * บิลที่ลดเพิ่มท้ายบิล/ใช้แต้มเป็นส่วนลด ค่านี้จะน้อยกว่า 1 — คืนเต็มราคาป้ายไม่ได้
   */
  factor: number
  items: ReturnableItem[]
}

interface ItemRow {
  id: string
  product_id: string | null
  unit_name: string | null
  unit_factor: number
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
  is_reward: boolean | null
  reward_points: number | null
  products: { name: string; sku: string | null; unit: string } | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * โหลดบิลเดิมพร้อมรายการที่ยังคืนได้ — รับทั้ง id และเลขที่บิล (RCddmmyyyy9999)
 * คืน null เมื่อไม่พบบิล, คืน error เมื่อพบแต่คืนไม่ได้ (เช่นยกเลิกไปแล้ว)
 */
export async function loadReturnableBill(
  supabase: SupabaseClient,
  identifier: string,
): Promise<{ bill: ReturnableBill | null; error: string | null }> {
  const key = identifier.trim()
  if (!key) return { bill: null, error: 'ใส่เลขที่บิลก่อน' }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
  const select = `
    id, transaction_number, created_at, status, customer_id, total, credit_used, return_credit,
    points_earned, points_used, sales_channel,
    customers(name, points, credit_balance),
    transaction_items(id, product_id, unit_name, unit_factor, quantity, unit_price, discount, subtotal, is_reward, reward_points, products(name, sku, unit))
  `
  const query = supabase.from('transactions').select(select)
  const { data: tx, error } = await (isUuid
    ? query.eq('id', key)
    : query.ilike('transaction_number', key)
  ).maybeSingle()

  if (error) return { bill: null, error: error.message }
  if (!tx) return { bill: null, error: `ไม่พบบิลเลขที่ ${key}` }
  if (tx.status === 'cancelled') {
    return { bill: null, error: 'บิลนี้ถูกยกเลิกไปแล้ว — ของคืนเข้าสต็อกตอนยกเลิกแล้ว ไม่ต้องทำใบคืนอีก' }
  }
  // ออเดอร์แพลตฟอร์ม (Shopee/TikTok/Lazada) คืนของผ่านระบบของแพลตฟอร์ม เงินไม่ได้อยู่ที่ร้าน
  // ให้รับคืนหน้าร้านแล้วจ่ายเงินสดคืนจะกลายเป็นจ่ายซ้ำกับที่แพลตฟอร์มคืนให้ลูกค้าเอง
  if (isPlatformChannel(tx.sales_channel)) {
    return {
      bill: null,
      error: 'บิลนี้ขายผ่านแพลตฟอร์ม — การคืนของต้องทำในระบบของแพลตฟอร์ม ไม่ใช่ที่หน้าร้าน',
    }
  }

  // คืนไปแล้วเท่าไหร่จากใบคืนก่อนหน้าของบิลนี้
  const { data: priorReturns } = await supabase.from('returns').select('id').eq('transaction_id', tx.id)
  const priorIds = (priorReturns ?? []).map((r) => r.id)
  const returnedByItem = new Map<string, number>()
  if (priorIds.length > 0) {
    const { data: priorItems } = await supabase
      .from('return_items')
      .select('transaction_item_id, quantity')
      .in('return_id', priorIds)
    for (const ri of priorItems ?? []) {
      if (!ri.transaction_item_id) continue
      returnedByItem.set(ri.transaction_item_id, (returnedByItem.get(ri.transaction_item_id) ?? 0) + ri.quantity)
    }
  }

  const rows = (tx.transaction_items ?? []) as unknown as ItemRow[]
  const itemsTotal = rows.reduce((s, r) => s + Number(r.subtotal), 0)
  const netPaid = Number(tx.total) + Number(tx.credit_used ?? 0) + Number(tx.return_credit ?? 0)
  const customer = tx.customers as unknown as { name: string; points: number; credit_balance: number } | null

  const items: ReturnableItem[] = rows.map((r) => {
    const returned = returnedByItem.get(r.id) ?? 0
    return {
      id: r.id,
      product_id: r.product_id,
      name: r.products?.name ?? 'สินค้าที่ถูกลบแล้ว',
      sku: r.products?.sku ?? null,
      unit_name: r.unit_name,
      unit_factor: r.unit_factor || 1,
      base_unit: r.products?.unit ?? '',
      quantity: r.quantity,
      unit_price: Number(r.unit_price),
      discount: Number(r.discount),
      subtotal: Number(r.subtotal),
      is_reward: Boolean(r.is_reward),
      reward_points: r.reward_points ?? 0,
      returned,
      remaining: Math.max(0, r.quantity - returned),
    }
  })

  return {
    bill: {
      id: tx.id,
      transaction_number: tx.transaction_number,
      created_at: tx.created_at,
      status: tx.status as TransactionStatus,
      customer_id: tx.customer_id,
      customer_name: customer?.name ?? null,
      customer_points: customer?.points ?? 0,
      customer_credit: customer?.credit_balance ?? 0,
      total: Number(tx.total),
      credit_used: Number(tx.credit_used ?? 0),
      return_credit: Number(tx.return_credit ?? 0),
      points_earned: tx.points_earned ?? 0,
      points_used: tx.points_used ?? 0,
      items_total: round2(itemsTotal),
      net_paid: round2(netPaid),
      // บิลที่เป็นของแลกแต้มทั้งใบ (จ่ายเงิน 0) ไม่มีเงินให้คืน — ตัวคูณเป็น 0
      factor: itemsTotal > 0 ? netPaid / itemsTotal : 0,
      items,
    },
    error: null,
  }
}

/** รายการที่เลือกรับคืน */
export interface ReturnSelection {
  itemId: string
  quantity: number
}

export interface ReturnQuote {
  /** มูลค่าที่ต้องคืนให้ลูกค้า (เงิน) */
  returnValue: number
  /** แต้มของแลกที่คืนกลับเข้าบัญชี */
  rewardPointsBack: number
  /** แต้มที่ต้องถอนคืน (ได้ไปจากบิลเดิมตามสัดส่วนของที่คืน) */
  pointsRevoked: number
  /** แต้มที่เคยใช้เป็นส่วนลดและคืนให้ตามสัดส่วน */
  pointsRestored: number
  /** สัดส่วนของที่คืนเทียบทั้งบิล */
  share: number
  lines: { item: ReturnableItem; quantity: number; amount: number; rewardPoints: number }[]
}

/** คิดยอดคืนจากรายการที่เลือก — ฟังก์ชันล้วน เรียกซ้ำได้ตอนผู้ใช้กดเพิ่ม/ลดจำนวน */
export function quoteReturn(bill: ReturnableBill, selection: ReturnSelection[]): ReturnQuote {
  const byId = new Map(bill.items.map((i) => [i.id, i]))
  const lines: ReturnQuote['lines'] = []
  let selectedSubtotal = 0
  let rewardPointsBack = 0

  for (const sel of selection) {
    const item = byId.get(sel.itemId)
    if (!item || sel.quantity <= 0) continue
    const qty = Math.min(sel.quantity, item.remaining)
    if (qty <= 0) continue
    const perUnit = item.quantity > 0 ? item.subtotal / item.quantity : 0
    const lineSubtotal = perUnit * qty
    // ของแลกแต้ม: ราคาถูกลดเต็มจำนวน subtotal เลยเป็น 0 — คืนเป็นแต้มกลับเข้าบัญชีแทนเงิน
    const rp = item.is_reward && item.quantity > 0 ? Math.round((item.reward_points / item.quantity) * qty) : 0
    selectedSubtotal += lineSubtotal
    rewardPointsBack += rp
    lines.push({ item, quantity: qty, amount: round2(lineSubtotal * bill.factor), rewardPoints: rp })
  }

  const share = bill.items_total > 0 ? selectedSubtotal / bill.items_total : 0
  return {
    returnValue: round2(selectedSubtotal * bill.factor),
    rewardPointsBack,
    pointsRevoked: Math.round(bill.points_earned * share),
    pointsRestored: Math.round(bill.points_used * share),
    share,
    lines,
  }
}

export interface CreateReturnParams {
  bill: ReturnableBill
  selection: ReturnSelection[]
  restock: boolean
  reason: string
  createdBy: string
  /** สินค้าใหม่ที่ลูกค้าเอาไปแทน — ว่าง = คืนของล้วน ไม่ได้ซื้อใหม่ */
  exchangeCart: CartItem[]
  /** วิธีรับเงินส่วนต่างของบิลใหม่ (ใช้เมื่อ exchangeCart ไม่ว่างและต้องเก็บเงินเพิ่ม) */
  paymentMethod: PaymentMethod
  cashReceived?: number | null
  /** วิธีคืนเงินส่วนที่เหลือให้ลูกค้า (ใช้เมื่อมีเงินต้องคืน) */
  refundMethod: RefundMethod | null
  /** ตั้งค่าแต้ม — null = ปิดระบบแต้ม บิลใหม่ไม่คิดแต้ม */
  pointsConfig: PointsConfig | null
}

export interface CreateReturnResult {
  returnId: string
  returnNumber: string
  returnValue: number
  offsetAmount: number
  refundAmount: number
  /** เงินที่เก็บเพิ่มจากลูกค้าในบิลใหม่ */
  extraPaid: number
  exchangeTransactionId: string | null
  exchangeNumber: string | null
}

/** ยอดเงินของบิลเปลี่ยนสินค้า — แยกเป็นฟังก์ชันไว้ให้หน้าจอโชว์ตัวเลขเดียวกับที่บันทึกจริง */
export function settleAmounts(returnValue: number, exchangeGross: number) {
  // ของที่คืนเอาไปหักบิลใหม่ได้ไม่เกินยอดบิลใหม่ — เกินมาคืนเป็นเงิน/เครดิต ไม่ทอนเป็นส่วนลดติดลบ
  const offsetAmount = round2(Math.min(returnValue, exchangeGross))
  return {
    offsetAmount,
    refundAmount: round2(returnValue - offsetAmount),
    extraPaid: round2(Math.max(0, exchangeGross - offsetAmount)),
  }
}

export async function createReturn(
  supabase: SupabaseClient,
  p: CreateReturnParams,
): Promise<{ error: string | null; result: CreateReturnResult | null }> {
  const { bill } = p
  const quote = quoteReturn(bill, p.selection)
  if (quote.lines.length === 0) return { error: 'ยังไม่ได้เลือกรายการที่รับคืน', result: null }

  const exchangeGross = round2(p.exchangeCart.reduce((s, i) => s + i.subtotal, 0))
  const { offsetAmount, refundAmount, extraPaid } = settleAmounts(quote.returnValue, exchangeGross)

  if (refundAmount > 0 && !p.refundMethod) {
    return { error: 'เลือกวิธีคืนเงินส่วนที่เหลือก่อน', result: null }
  }
  if (refundAmount > 0 && p.refundMethod === 'credit' && !bill.customer_id) {
    return { error: 'เก็บเป็นเครดิตได้เฉพาะบิลที่มีลูกค้าสมาชิก', result: null }
  }

  // ── 1. บิลใหม่ (ถ้าเปลี่ยนสินค้า) ──────────────────────────────────────────
  // ทำก่อนใบคืน เพราะเป็นขั้นที่พลาดได้มากที่สุด (ขอเลขที่ + เขียนหลายตาราง)
  // ถ้าล้มตรงนี้ยังไม่มีอะไรถูกแก้เลย ของยังไม่เข้าสต็อก แต้มยังไม่ขยับ
  let exchangeTx: { id: string; transaction_number: string } | null = null
  if (p.exchangeCart.length > 0) {
    // ค่ารักษา/ค่าบริการในบิลเปลี่ยนสินค้าก็ไม่สะสมแต้มเหมือนขายปกติ
    const earnedPoints = earnedPointsFor(p.exchangeCart, extraPaid, p.pointsConfig)

    let lastError: string | undefined
    for (let attempt = 0; attempt < 2 && !exchangeTx; attempt++) {
      const { data: txNumber, error: numError } = await supabase.rpc('next_transaction_number', {})
      if (numError || !txNumber) {
        return { error: 'สร้างเลขที่บิลใหม่ไม่สำเร็จ: ' + (numError?.message ?? ''), result: null }
      }

      const { data, error: txError } = await supabase
        .from('transactions')
        .insert({
          transaction_number: txNumber,
          cashier_id: p.createdBy,
          customer_id: bill.customer_id,
          subtotal: exchangeGross,
          discount: 0,
          // total = เงินที่รับจริงเท่านั้น ส่วนที่หักด้วยของที่คืนอยู่ใน return_credit
          // (หลักเดียวกับ credit_used ที่มีอยู่แล้ว — สรุปกะ/รายงานอ่าน total ตรง ๆ ได้เลย)
          total: extraPaid,
          return_credit: offsetAmount,
          rounding: 0,
          payment_method: extraPaid > 0 ? p.paymentMethod : 'cash',
          sales_channel: 'store',
          cash_received: extraPaid > 0 && p.paymentMethod === 'cash' && p.cashReceived ? p.cashReceived : null,
          change_given:
            extraPaid > 0 && p.paymentMethod === 'cash' && p.cashReceived
              ? Math.max(0, round2(p.cashReceived - extraPaid))
              : null,
          points_earned: earnedPoints,
          points_used: 0,
          credit_used: 0,
          notes: `เปลี่ยนสินค้าจากบิล ${bill.transaction_number}`,
        })
        .select('id, transaction_number')
        .single()

      if (data) {
        exchangeTx = data
      } else {
        lastError = txError?.message
        // เลขที่ชนกัน (ขายพร้อมกันสองเครื่อง) — ขอเลขใหม่อีกรอบ
        if (txError?.code !== '23505') break
      }
    }

    if (!exchangeTx) return { error: 'บันทึกบิลใหม่ไม่สำเร็จ: ' + (lastError ?? ''), result: null }

    const { error: itemsError } = await supabase.from('transaction_items').insert(
      p.exchangeCart.map((item) => ({
        transaction_id: exchangeTx!.id,
        product_id: item.product.id,
        product_lot_id: item.lot_id,
        product_unit_id: item.unit?.id ?? null,
        unit_factor: item.unit?.factor ?? 1,
        unit_name: item.unit?.unit_name ?? null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        subtotal: item.subtotal,
        vat_applicable: isVatApplicable(item.product),
        is_reward: false,
        reward_points: 0,
      })),
    )
    if (itemsError) {
      return {
        error: `บิลใหม่ ${exchangeTx.transaction_number} บันทึกแล้ว แต่เก็บรายการในบิลไม่สำเร็จ (${itemsError.message}) — ยังไม่ได้ทำใบคืน ให้ยกเลิกบิลใหม่แล้วทำอีกครั้ง`,
        result: null,
      }
    }

    await deductStock(supabase, p.exchangeCart, {
      transactionId: exchangeTx.id,
      type: 'sale',
      reason: exchangeTx.transaction_number,
      createdBy: p.createdBy,
    })
  }

  // ── 2. ใบคืน ───────────────────────────────────────────────────────────────
  const { data: returnNumber, error: rnError } = await supabase.rpc('next_return_number', {})
  if (rnError || !returnNumber) {
    return {
      error:
        'สร้างเลขที่ใบคืนไม่สำเร็จ: ' +
        (rnError?.message ?? '') +
        (exchangeTx ? ` — บิลใหม่ ${exchangeTx.transaction_number} บันทึกไปแล้ว ของที่รับคืนยังไม่เข้าสต็อก` : ''),
      result: null,
    }
  }

  const { data: ret, error: retError } = await supabase
    .from('returns')
    .insert({
      return_number: returnNumber,
      transaction_id: bill.id,
      exchange_transaction_id: exchangeTx?.id ?? null,
      customer_id: bill.customer_id,
      return_value: quote.returnValue,
      offset_amount: offsetAmount,
      refund_amount: refundAmount,
      refund_method: refundAmount > 0 ? p.refundMethod : null,
      points_revoked: quote.pointsRevoked,
      points_refunded: quote.pointsRestored + quote.rewardPointsBack,
      restocked: p.restock,
      reason: p.reason.trim() || null,
      created_by: p.createdBy,
    })
    .select('id, return_number')
    .single()

  if (retError || !ret) {
    return {
      error:
        'บันทึกใบคืนไม่สำเร็จ: ' +
        (retError?.message ?? '') +
        (exchangeTx ? ` — บิลใหม่ ${exchangeTx.transaction_number} บันทึกไปแล้ว ของที่รับคืนยังไม่เข้าสต็อก` : ''),
      result: null,
    }
  }

  await supabase.from('return_items').insert(
    quote.lines.map((l) => ({
      return_id: ret.id,
      transaction_item_id: l.item.id,
      product_id: l.item.product_id,
      quantity: l.quantity,
      unit_factor: l.item.unit_factor,
      unit_name: l.item.unit_name,
      amount: l.amount,
      reward_points: l.rewardPoints,
    })),
  )

  // ── 3. คืนของเข้าสต็อก ─────────────────────────────────────────────────────
  if (p.restock) {
    await restockReturn(supabase, {
      transactionId: bill.id,
      returnId: ret.id,
      returnNumber: ret.return_number,
      createdBy: p.createdBy,
      lines: quote.lines.map((l) => ({
        productId: l.item.product_id,
        baseQuantity: l.quantity * l.item.unit_factor,
      })),
    })
  }

  // ── 4. แต้ม / ยอดสะสม / เครดิตของลูกค้า ────────────────────────────────────
  if (bill.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('points, total_spent, credit_balance')
      .eq('id', bill.customer_id)
      .single()

    if (customer) {
      const earnedOnExchange = exchangeTx ? earnedPointsFor(p.exchangeCart, extraPaid, p.pointsConfig) : 0
      const pointsDelta = quote.pointsRestored + quote.rewardPointsBack - quote.pointsRevoked + earnedOnExchange
      await supabase
        .from('customers')
        .update({
          points: Math.max(0, customer.points + pointsDelta),
          // ยอดซื้อสะสม: ถอนมูลค่าของที่คืนออก แล้วบวกเงินที่จ่ายเพิ่มในบิลใหม่
          total_spent: Math.max(0, round2(customer.total_spent - quote.returnValue + extraPaid)),
          credit_balance:
            p.refundMethod === 'credit' && refundAmount > 0
              ? round2(customer.credit_balance + refundAmount)
              : customer.credit_balance,
        })
        .eq('id', bill.customer_id)
    }
  }

  return {
    error: null,
    result: {
      returnId: ret.id,
      returnNumber: ret.return_number,
      returnValue: quote.returnValue,
      offsetAmount,
      refundAmount,
      extraPaid,
      exchangeTransactionId: exchangeTx?.id ?? null,
      exchangeNumber: exchangeTx?.transaction_number ?? null,
    },
  }
}

/**
 * คืนของเข้าล็อตเดิมที่ตัดออกไปตอนขาย
 *
 * stock_movements ตอนขายไม่ได้ผูกกับบรรทัดในบิล (ผูกแค่สินค้า+ล็อต) ของชิ้นเดียวกันที่
 * ตัดข้ามล็อตจึงต้องไล่คืนตามลำดับเดิม หักส่วนที่ใบคืนก่อนหน้าเอาคืนไปแล้วออกก่อน
 * ล็อตที่หาไม่เจอ (ขายเกินสต็อก/ล็อตถูกลบ) ตกไปที่ล็อตแรกของสินค้า ยอดรวมยังถูก
 */
async function restockReturn(
  supabase: SupabaseClient,
  p: {
    transactionId: string
    returnId: string
    returnNumber: string
    createdBy: string
    lines: { productId: string | null; baseQuantity: number }[]
  },
): Promise<void> {
  const { data: saleMoves } = await supabase
    .from('stock_movements')
    .select('product_id, product_lot_id, quantity, created_at')
    .eq('transaction_id', p.transactionId)
    .eq('type', 'sale')
    .order('created_at')

  // คืนไปแล้วเท่าไหร่ต่อสินค้า (จากใบคืน/ยกเลิกก่อนหน้าของบิลเดียวกัน)
  const { data: backMoves } = await supabase
    .from('stock_movements')
    .select('product_id, quantity')
    .eq('transaction_id', p.transactionId)
    .in('type', ['return', 'cancel'])

  const alreadyBack = new Map<string, number>()
  for (const m of backMoves ?? []) {
    alreadyBack.set(m.product_id, (alreadyBack.get(m.product_id) ?? 0) + m.quantity)
  }

  for (const line of p.lines) {
    if (!line.productId || line.baseQuantity <= 0) continue

    const moves = (saleMoves ?? []).filter((m) => m.product_id === line.productId && m.product_lot_id)
    let skip = alreadyBack.get(line.productId) ?? 0
    let remaining = line.baseQuantity

    for (const m of moves) {
      if (remaining <= 0) break
      // ข้ามส่วนที่ใบคืนก่อนหน้าเอาคืนไปแล้ว
      let capacity = m.quantity
      if (skip > 0) {
        const used = Math.min(skip, capacity)
        skip -= used
        capacity -= used
      }
      if (capacity <= 0) continue

      const give = Math.min(capacity, remaining)
      await addStock(supabase, m.product_lot_id!, give)
      await supabase.from('stock_movements').insert({
        product_id: line.productId,
        product_lot_id: m.product_lot_id,
        transaction_id: p.transactionId,
        return_id: p.returnId,
        type: 'return',
        quantity: give,
        reason: `รับคืนสินค้า ${p.returnNumber}`,
        created_by: p.createdBy,
      })
      remaining -= give
    }

    // ไม่เหลือล็อตให้คืน (ขายเกินสต็อก / ล็อตถูกลบ) — ลงล็อตแรกของสินค้าไว้ ยอดรวมยังถูก
    if (remaining > 0) {
      const { data: lot } = await supabase
        .from('product_lots')
        .select('id')
        .eq('product_id', line.productId)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      if (!lot) continue
      await addStock(supabase, lot.id, remaining)
      await supabase.from('stock_movements').insert({
        product_id: line.productId,
        product_lot_id: lot.id,
        transaction_id: p.transactionId,
        return_id: p.returnId,
        type: 'return',
        quantity: remaining,
        reason: `รับคืนสินค้า ${p.returnNumber}`,
        created_by: p.createdBy,
      })
    }
  }
}

async function addStock(supabase: SupabaseClient, lotId: string, qty: number): Promise<void> {
  const { data: lot } = await supabase.from('product_lots').select('quantity').eq('id', lotId).single()
  if (!lot) return
  await supabase.from('product_lots').update({ quantity: lot.quantity + qty }).eq('id', lotId)
}
