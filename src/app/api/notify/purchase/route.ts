import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/require-staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPurchaseOrderMessage, buildStockReceivedMessage, notifyEvent } from '@/lib/notify'

// stage = 'created' (เพิ่งสร้างใบสั่งซื้อ) | 'received' (ของมาส่งแล้ว กดรับเข้าสต็อก)
export async function POST(request: NextRequest) {
  const staff = await getStaff()
  if (!staff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { purchaseId, stage } = await request.json()
  if (!purchaseId || (stage !== 'created' && stage !== 'received')) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: po } = await admin
    .from('purchases')
    .select('id, purchase_number, total_cost, received_at, suppliers(name), purchase_items(id), creator:profiles!purchases_created_by_fkey(name), receiver:profiles!purchases_received_by_fkey(name)')
    .eq('id', purchaseId)
    .maybeSingle()

  if (!po) return NextResponse.json({ error: 'ไม่พบใบสั่งซื้อ' }, { status: 404 })

  const supplier = po.suppliers as unknown as { name: string } | null
  const creator = po.creator as unknown as { name: string } | null
  const receiver = po.receiver as unknown as { name: string } | null
  const info = {
    purchaseNumber: po.purchase_number,
    supplier: supplier?.name ?? null,
    itemCount: (po.purchase_items ?? []).length,
    totalCost: po.total_cost ?? 0,
    by: (stage === 'received' ? receiver?.name : creator?.name) ?? null,
  }

  if (stage === 'created') {
    await notifyEvent('purchase_order', buildPurchaseOrderMessage(info), { dedupeKey: `po:${po.id}` })
  } else {
    await notifyEvent('stock_received', buildStockReceivedMessage(info), {
      dedupeKey: `po-received:${po.id}:${po.received_at ?? ''}`,
    })
  }

  return NextResponse.json({ sent: true })
}
