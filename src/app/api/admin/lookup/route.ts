import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStaff } from '@/lib/require-staff'

/**
 * ค้นหาลูกค้า/สัตว์เลี้ยงสำหรับช่องเลือกในหน้าหลังร้าน
 *
 * เดิมหน้าพวกนั้นโหลดลูกค้าและสัตว์ "ทั้งตาราง" ไปให้เบราว์เซอร์ filter เอง
 * ซึ่งพอข้อมูลเกิน 1000 แถว PostgREST จะตัดทิ้งเงียบ ๆ ทำให้บางตัวหายจากช่องเลือก
 * ทั้งที่ยังอยู่ใน DB — ค้นที่ฝั่ง server แทน จำนวนลูกค้าจึงโตได้ไม่จำกัด
 */

const LIMIT = 10

/** ผู้ใช้พิมพ์ % หรือ _ มาได้ ต้อง escape ก่อนยัดเข้า ilike ไม่งั้นความหมายเพี้ยน */
const escapeLike = (q: string) => q.replace(/[%_\\]/g, (c) => `\\${c}`)

export async function GET(request: NextRequest) {
  // ต้องเป็นพนักงานที่อนุมัติแล้ว — แค่มี session ยังไม่พอ (ดู lib/require-staff)
  if (!(await getStaff())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const type = request.nextUrl.searchParams.get('type')
  const raw = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (raw.length < 1) return NextResponse.json({ results: [] })

  const q = `%${escapeLike(raw)}%`

  if (type === 'customers') {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone')
      .or(`name.ilike.${q},phone.ilike.${q}`)
      .order('name')
      .limit(LIMIT)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ results: data ?? [] })
  }

  if (type === 'pets') {
    // ค้นชื่อสัตว์กับค้นทางเจ้าของต้องแยกกัน — .or() ของ PostgREST
    // ข้ามไปเงื่อนไขบนตารางที่ join มาไม่ได้
    const columns = '*, customers(id, name, phone)'
    const [byPet, byOwner] = await Promise.all([
      supabase.from('pets').select(columns)
        .eq('active', true).ilike('name', q).order('name').limit(LIMIT),
      supabase.from('pets').select(`*, customers!inner(id, name, phone)`)
        .eq('active', true).or(`name.ilike.${q},phone.ilike.${q}`, { referencedTable: 'customers' })
        .order('name').limit(LIMIT),
    ])

    if (byPet.error) return NextResponse.json({ error: byPet.error.message }, { status: 500 })
    if (byOwner.error) return NextResponse.json({ error: byOwner.error.message }, { status: 500 })

    const seen = new Set<string>()
    const results = [...(byPet.data ?? []), ...(byOwner.data ?? [])]
      .filter((p) => !seen.has(p.id) && seen.add(p.id))
      .slice(0, LIMIT)

    return NextResponse.json({ results })
  }

  return NextResponse.json({ error: 'unknown type' }, { status: 400 })
}
