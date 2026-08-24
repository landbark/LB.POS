import { NextResponse, type NextRequest } from 'next/server'
import { getCustomerId } from '@/lib/customer-session'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const customerId = await getCustomerId()
  if (!customerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return NextResponse.json({ addresses: data ?? [] })
}

export async function POST(request: NextRequest) {
  const customerId = await getCustomerId()
  if (!customerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json()
  const required = ['recipient_name', 'phone', 'address_line', 'province'] as const
  for (const field of required) {
    if (!String(body[field] ?? '').trim()) {
      return NextResponse.json({ error: 'กรอกที่อยู่ให้ครบ' }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  const isDefault = Boolean(body.is_default)
  // ที่อยู่หลักมีได้อันเดียว
  if (isDefault) {
    await admin.from('customer_addresses').update({ is_default: false }).eq('customer_id', customerId)
  }

  const { data, error } = await admin
    .from('customer_addresses')
    .insert({
      customer_id: customerId,
      label: String(body.label ?? '').trim() || null,
      recipient_name: String(body.recipient_name).trim(),
      phone: String(body.phone).trim(),
      address_line: String(body.address_line).trim(),
      subdistrict: String(body.subdistrict ?? '').trim() || null,
      district: String(body.district ?? '').trim() || null,
      province: String(body.province).trim(),
      postal_code: String(body.postal_code ?? '').trim() || null,
      note: String(body.note ?? '').trim() || null,
      is_default: isDefault,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ address: data })
}

export async function DELETE(request: NextRequest) {
  const customerId = await getCustomerId()
  if (!customerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('customer_addresses')
    .delete()
    .eq('id', id)
    .eq('customer_id', customerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
