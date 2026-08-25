import { NextResponse, type NextRequest } from 'next/server'
import postcodes from '@/data/thai-postcodes.json'

// ค้นตำบล/อำเภอ/จังหวัด จากรหัสไปรษณีย์ — อ่านตารางฝั่ง server เท่านั้น
// (ไฟล์ข้อมูล 600KB จะได้ไม่ติดไปกับ bundle ของ browser)
const TABLE = postcodes as unknown as Record<string, [string, string, string][]>

export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get('code') ?? '').trim()
  if (!/^\d{5}$/.test(code)) {
    return NextResponse.json({ options: [] })
  }

  const rows = TABLE[code] ?? []
  return NextResponse.json({
    options: rows.map(([subdistrict, district, province]) => ({ subdistrict, district, province })),
  })
}
