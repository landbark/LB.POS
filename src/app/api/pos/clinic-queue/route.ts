import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStaff } from '@/lib/require-staff'
import { fetchClinicQueue } from '@/lib/clinicQueue'

/**
 * คิวเก็บเงินจากคลินิกแบบสด — หน้าขายถามซ้ำเป็นระยะ
 *
 * คิวที่ส่งไปตอนเรนเดอร์หน้า /pos เป็นภาพนิ่ง ณ ตอนเปิดหน้า
 * ใบที่หมอส่งมาหลังจากนั้นจะไม่โผล่จนกว่าจะรีโหลด — ซึ่งรีโหลดแล้วตะกร้าหาย
 * แคชเชียร์ที่ยิงสินค้าไว้ครึ่งบิลเลยต้องยิงใหม่ทั้งหมด เส้นนี้มีไว้ตัดปัญหานั้น
 */
export async function GET() {
  const staff = await getStaff()
  if (!staff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const visits = await fetchClinicQueue(supabase)
  return NextResponse.json({ visits }, { headers: { 'Cache-Control': 'no-store' } })
}
