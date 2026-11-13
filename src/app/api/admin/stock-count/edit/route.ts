import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaff } from '@/lib/require-staff'
import { pushAppNotification } from '@/lib/appNotify'
import { buildStockCountEditMessage, notifyEvent } from '@/lib/notify'
import {
  applyCountedQuantityEdit,
  canReopen,
  needsApproval,
  stockDeltaFor,
  touchesStock,
} from '@/lib/stockCountEdit'
import type { StockCountEditField, StockCountStatus } from '@/lib/types'

/**
 * แก้รอบนับสต็อกที่ปิดไปแล้ว — ทุกการแก้ลงล็อกที่ stock_count_edits พร้อมกัน
 *
 * ทำที่ฝั่งเซิร์ฟเวอร์ทั้งหมด (service role) เพราะ
 *   1. แก้จำนวนของรอบที่ปรับสต็อกแล้ว = ต้องขยับ product_lots + ลง stock_movements ด้วย
 *      ปล่อยให้เบราว์เซอร์ยิงทีละคำสั่งแล้วปิดแท็บกลางคัน จะได้สต็อกที่ปรับไปครึ่งเดียว
 *   2. RLS ปิดทางให้ authenticated เขียน stock_count_edits ไม่ได้เลย — ถ้าแก้ได้จากเบราว์เซอร์
 *      คนที่แก้ก็ลบร่องรอยของตัวเองได้ ล็อกก็ไม่มีความหมาย
 *   3. รอบที่ปิดแล้วถูก policy แบบ RESTRICTIVE ปิดการเขียน stock_count_items ไว้ด้วย
 */

type Body =
  | { action: 'rename'; countId: string; name?: string | null; note?: string | null }
  | { action: 'reopen'; countId: string }
  | { action: 'cancel'; countId: string }
  | { action: 'item'; itemId: string; countedQuantity?: number; note?: string | null }
  | { action: 'approve'; editId: string }
  | { action: 'reject'; editId: string; reason?: string | null }

interface CountRow {
  id: string
  count_number: string
  name: string | null
  note: string | null
  status: StockCountStatus
}

interface ItemRow {
  id: string
  count_id: string
  product_id: string
  product_lot_id: string | null
  counted_quantity: number
  system_quantity: number
  applied_diff: number | null
  note: string | null
  products: { name: string; unit: string } | null
}

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export async function POST(request: NextRequest) {
  const staff = await getStaff()
  if (!staff) return bad('unauthorized', 401)

  const body = (await request.json()) as Body
  const admin = createAdminClient()

  /** ลงล็อกหนึ่งบรรทัด — ทุกทางที่แก้ข้อมูลต้องผ่านตรงนี้ */
  const log = (row: {
    countId: string
    itemId?: string | null
    productId?: string | null
    field: StockCountEditField
    oldValue: string | null
    newValue: string | null
    stockDelta?: number | null
    status?: 'applied' | 'pending'
  }) =>
    admin
      .from('stock_count_edits')
      .insert({
        count_id: row.countId,
        item_id: row.itemId ?? null,
        product_id: row.productId ?? null,
        field: row.field,
        old_value: row.oldValue,
        new_value: row.newValue,
        stock_delta: row.stockDelta ?? null,
        status: row.status ?? 'applied',
        requested_by: staff.userId,
        // เจ้าของร้านแก้เอง = คนขอกับคนอนุมัติเป็นคนเดียวกัน บันทึกไว้ให้ครบ
        decided_by: (row.status ?? 'applied') === 'applied' ? staff.userId : null,
        decided_at: (row.status ?? 'applied') === 'applied' ? new Date().toISOString() : null,
      })
      .select('id')
      .single()

  const loadCount = async (countId: string) => {
    const { data } = await admin
      .from('stock_counts')
      .select('id, count_number, name, note, status')
      .eq('id', countId)
      .maybeSingle()
    return (data as CountRow | null) ?? null
  }

  const loadItem = async (itemId: string) => {
    const { data } = await admin
      .from('stock_count_items')
      .select('id, count_id, product_id, product_lot_id, counted_quantity, system_quantity, applied_diff, note, products(name, unit)')
      .eq('id', itemId)
      .maybeSingle()
    return (data as unknown as ItemRow | null) ?? null
  }

  // ── แก้ชื่อรอบ / หมายเหตุรอบ — พนักงานทุกคน ทุกสถานะ ───────────────────────
  if (body.action === 'rename') {
    const count = await loadCount(body.countId)
    if (!count) return bad('ไม่พบรอบนับ', 404)

    const patch: Record<string, string | null> = {}
    const name = body.name === undefined ? undefined : (body.name ?? '').trim() || null
    const note = body.note === undefined ? undefined : (body.note ?? '').trim() || null

    if (name !== undefined && name !== count.name) patch.name = name
    if (note !== undefined && note !== count.note) patch.note = note
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, changed: false })

    const { error } = await admin.from('stock_counts').update(patch).eq('id', count.id)
    if (error) return bad(error.message, 500)

    if (patch.name !== undefined) {
      await log({ countId: count.id, field: 'name', oldValue: count.name, newValue: patch.name })
    }
    if (patch.note !== undefined) {
      await log({ countId: count.id, field: 'note', oldValue: count.note, newValue: patch.note })
    }
    return NextResponse.json({ ok: true, changed: true })
  }

  // ── เปิดรอบที่ยกเลิกไว้กลับมานับต่อ — เจ้าของร้านเท่านั้น ───────────────────
  if (body.action === 'reopen') {
    const count = await loadCount(body.countId)
    if (!count) return bad('ไม่พบรอบนับ', 404)
    if (count.status !== 'cancelled') return bad('เปิดกลับได้เฉพาะรอบที่ยกเลิกไว้')
    if (!canReopen(count.status, staff.role)) return bad('เปิดรอบกลับได้เฉพาะเจ้าของร้าน', 403)

    const { error } = await admin
      .from('stock_counts')
      .update({ status: 'counting' })
      .eq('id', count.id)
    if (error) return bad(error.message, 500)

    await log({ countId: count.id, field: 'status', oldValue: 'cancelled', newValue: 'counting' })
    return NextResponse.json({ ok: true })
  }

  // ── ยกเลิกรอบนับ — พนักงานทุกคน แต่ลงล็อกไว้ว่าใครยกเลิก ────────────────────
  // (ย้ายมาที่นี่เพราะ policy ปิดการ UPDATE stock_counts จากเบราว์เซอร์ไปแล้ว)
  if (body.action === 'cancel') {
    const count = await loadCount(body.countId)
    if (!count) return bad('ไม่พบรอบนับ', 404)
    if (count.status !== 'counting') return bad('ยกเลิกได้เฉพาะรอบที่ยังนับอยู่')

    const { error } = await admin
      .from('stock_counts')
      .update({ status: 'cancelled' })
      .eq('id', count.id)
    if (error) return bad(error.message, 500)

    await log({ countId: count.id, field: 'status', oldValue: 'counting', newValue: 'cancelled' })
    return NextResponse.json({ ok: true })
  }

  // ── แก้จำนวนที่นับได้ / หมายเหตุของแถวหนึ่ง ────────────────────────────────
  if (body.action === 'item') {
    const item = await loadItem(body.itemId)
    if (!item) return bad('ไม่พบรายการที่นับ', 404)
    const count = await loadCount(item.count_id)
    if (!count) return bad('ไม่พบรอบนับ', 404)
    if (count.status === 'counting') {
      return bad('รอบนี้ยังนับอยู่ — แก้ที่ตารางได้เลย ไม่ต้องผ่านคำขอ')
    }

    const noteNext = body.note === undefined ? undefined : (body.note ?? '').trim() || null
    const qtyNext = body.countedQuantity
    if (qtyNext !== undefined && (!Number.isInteger(qtyNext) || qtyNext < 0)) {
      return bad('จำนวนไม่ถูกต้อง')
    }

    // หมายเหตุไม่แตะสต็อก — แก้ได้เลยไม่ต้องขออนุมัติ
    if (noteNext !== undefined && noteNext !== item.note) {
      const { error } = await admin
        .from('stock_count_items')
        .update({ note: noteNext })
        .eq('id', item.id)
      if (error) return bad(error.message, 500)
      await log({
        countId: count.id,
        itemId: item.id,
        productId: item.product_id,
        field: 'item_note',
        oldValue: item.note,
        newValue: noteNext,
      })
    }

    if (qtyNext === undefined || qtyNext === item.counted_quantity) {
      return NextResponse.json({ ok: true, pending: false })
    }

    // พนักงานขอแก้รอบที่ปรับสต็อกแล้ว — เข้าคิวรอเจ้าของร้าน ยังไม่แตะอะไร
    if (needsApproval(count.status, staff.role)) {
      // ขอซ้ำแถวเดิม = ทับใบเดิม (มี unique index กันไว้อยู่แล้ว)
      await admin
        .from('stock_count_edits')
        .delete()
        .eq('item_id', item.id)
        .eq('field', 'counted_quantity')
        .eq('status', 'pending')

      const { error } = await log({
        countId: count.id,
        itemId: item.id,
        productId: item.product_id,
        field: 'counted_quantity',
        oldValue: String(item.counted_quantity),
        newValue: String(qtyNext),
        stockDelta: stockDeltaFor(item, qtyNext),
        status: 'pending',
      })
      if (error) return bad(error.message, 500)

      const path = `/admin/stock-count/${count.id}`
      const productName = item.products?.name ?? 'สินค้า'
      const unit = item.products?.unit ?? 'ชิ้น'
      await pushAppNotification(admin, {
        kind: 'stock_count_edit',
        title: 'ขอแก้ผลนับสต็อก — รออนุมัติ',
        body:
          `${productName}: ${item.counted_quantity} → ${qtyNext} ${unit} ` +
          `(รอบ ${count.name || count.count_number})${staff.name ? ` · ${staff.name}` : ''}`,
        link: path,
      })
      await notifyEvent(
        'stock_count_edit',
        buildStockCountEditMessage({
          countNumber: count.count_number,
          countName: count.name,
          productName,
          unit,
          from: item.counted_quantity,
          to: qtyNext,
          stockDelta: stockDeltaFor(item, qtyNext),
          by: staff.name,
          path,
        })
      )

      return NextResponse.json({ ok: true, pending: true })
    }

    const result = await applyCountedQuantityEdit(admin, {
      count,
      item,
      nextCounted: qtyNext,
      staffId: staff.userId,
      staffName: staff.name,
    })

    await log({
      countId: count.id,
      itemId: item.id,
      productId: item.product_id,
      field: 'counted_quantity',
      oldValue: String(item.counted_quantity),
      newValue: String(qtyNext),
      stockDelta: result.stockDelta,
    })

    return NextResponse.json({ ok: true, pending: false, ...result })
  }

  // ── อนุมัติ / ไม่อนุมัติคำขอ — เจ้าของร้านเท่านั้น ─────────────────────────
  if (body.action === 'approve' || body.action === 'reject') {
    if (staff.role !== 'admin') return bad('อนุมัติได้เฉพาะเจ้าของร้าน', 403)

    const { data: editRow } = await admin
      .from('stock_count_edits')
      .select('*')
      .eq('id', body.editId)
      .maybeSingle()
    const edit = editRow as {
      id: string
      count_id: string
      item_id: string | null
      field: StockCountEditField
      new_value: string | null
      status: string
    } | null

    if (!edit) return bad('ไม่พบคำขอ', 404)
    if (edit.status !== 'pending') return bad('คำขอนี้ตัดสินไปแล้ว')

    const decided = { decided_by: staff.userId, decided_at: new Date().toISOString() }

    if (body.action === 'reject') {
      const { error } = await admin
        .from('stock_count_edits')
        .update({ ...decided, status: 'rejected', reject_reason: (body.reason ?? '').trim() || null })
        .eq('id', edit.id)
      if (error) return bad(error.message, 500)
      return NextResponse.json({ ok: true })
    }

    if (edit.field !== 'counted_quantity' || !edit.item_id) {
      return bad('คำขอนี้ไม่ใช่การแก้จำนวนที่นับได้')
    }

    const item = await loadItem(edit.item_id)
    if (!item) return bad('รายการที่ขอแก้ถูกเอาออกจากรอบไปแล้ว', 404)
    const count = await loadCount(edit.count_id)
    if (!count) return bad('ไม่พบรอบนับ', 404)

    const target = Number(edit.new_value)
    if (!Number.isInteger(target) || target < 0) return bad('จำนวนในคำขอไม่ถูกต้อง')

    const result = await applyCountedQuantityEdit(admin, {
      count,
      item,
      nextCounted: target,
      staffId: staff.userId,
      staffName: staff.name,
    })

    const { error } = await admin
      .from('stock_count_edits')
      .update({
        ...decided,
        status: 'approved',
        // ยอดก่อนแก้อาจขยับไปตั้งแต่ตอนขอ — เก็บค่าที่เป็นจริง ณ ตอนลงมือ
        old_value: String(item.counted_quantity),
        stock_delta: result.stockDelta,
      })
      .eq('id', edit.id)
    if (error) return bad(error.message, 500)

    return NextResponse.json({ ok: true, ...result, touchedStock: touchesStock(count.status) })
  }

  return bad('unknown action')
}
