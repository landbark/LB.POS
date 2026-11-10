import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/require-staff'
import { COUNT_TABLES, type MergeKind } from '@/lib/merge'

/**
 * รวมข้อมูลซ้ำ — เจ้าของสัตว์ (ลูกค้า) และสัตว์เลี้ยง
 *
 * GET  = ดึงรายละเอียดของรายการที่เลือกไว้เทียบกัน พร้อมจำนวนประวัติที่จะถูกย้าย
 * POST = รวมจริง โดยเรียกฟังก์ชันใน DB (merge_customers / merge_pets)
 *
 * งานรวมอยู่ใน DB ไม่ใช่ที่นี่ เพราะต้องย้าย reference หลายตารางแล้วลบแถวทิ้ง —
 * ยิง REST ทีละคำสั่งจากฝั่งนี้ ถ้าพลาดกลางทางจะเหลือข้อมูลค้างครึ่ง ๆ กลาง ๆ
 * ส่วนฟังก์ชันใน DB ทำทั้งชุดในทรานแซคชันเดียว พลาดแล้ว rollback หมด
 *
 * สิทธิ์เช็คสองชั้น: getAdmin() ที่นี่ และ is_admin() ในฟังก์ชัน SQL
 * (เรียก rpc ด้วย session ของผู้ใช้ ไม่ใช่ service role — auth.uid() ในฟังก์ชันจึงเป็นคนที่กดจริง)
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseKind(value: string | null): MergeKind | null {
  return value === 'customer' || value === 'pet' ? value : null
}

export async function GET(request: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const kind = parseKind(request.nextUrl.searchParams.get('kind'))
  if (!kind) return NextResponse.json({ error: 'unknown kind' }, { status: 400 })

  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID.test(s))
    .slice(0, 5)

  if (ids.length === 0) return NextResponse.json({ records: [] })

  const supabase = await createClient()

  const { data, error } = kind === 'customer'
    ? await supabase.from('customers').select('*').in('id', ids)
    : await supabase.from('pets').select('*, customers(id, name, phone, hn)').in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // จำนวนประวัติของแต่ละใบ — พนักงานต้องเห็นว่ากดรวมแล้วอะไรย้ายไปกี่รายการ
  const counts = await Promise.all(
    (data ?? []).map(async (row) => {
      const entries = await Promise.all(
        COUNT_TABLES[kind].map(async ({ table, column }) => {
          const { count } = await supabase
            .from(table)
            .select('id', { count: 'exact', head: true })
            .eq(column, row.id)
          return [table, count ?? 0] as const
        })
      )
      return Object.fromEntries(entries.filter(([, n]) => n > 0))
    })
  )

  // เรียงตามลำดับที่ขอมา เพื่อให้คอลัมน์ในหน้าเปรียบเทียบไม่สลับที่ทุกครั้งที่โหลด
  const records = (data ?? []).map((row, i) => ({ ...row, counts: counts[i] }))
  records.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))

  return NextResponse.json({ records })
}

export async function POST(request: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const kind = parseKind(body?.kind ?? null)
  const keep = typeof body?.keep === 'string' ? body.keep : ''
  const merge: string[] = Array.isArray(body?.merge) ? body.merge : []
  const overrides = body?.overrides && typeof body.overrides === 'object' ? body.overrides : {}

  if (!kind) return NextResponse.json({ error: 'ไม่รู้ว่ารวมอะไร' }, { status: 400 })
  if (!UUID.test(keep)) return NextResponse.json({ error: 'ไม่ได้เลือกรายการที่จะเก็บไว้' }, { status: 400 })

  const ids = merge.filter((id) => typeof id === 'string' && UUID.test(id) && id !== keep)
  if (ids.length === 0) return NextResponse.json({ error: 'ไม่ได้เลือกรายการที่จะรวมเข้ามา' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    kind === 'customer' ? 'merge_customers' : 'merge_pets',
    { p_keep: keep, p_merge: ids, p_overrides: overrides }
  )

  if (error) {
    // 42883 = ยังไม่ได้รัน migration (ฟังก์ชันไม่มีใน DB)
    if (error.code === '42883') {
      return NextResponse.json(
        { error: 'ยังไม่ได้ติดตั้งฟังก์ชันรวมข้อมูลใน DB — รัน supabase-migration-merge-duplicates.sql ก่อน' },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ result: data })
}
