import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/require-staff'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { findCustomerDuplicates, findPetDuplicates, type MergeKind } from '@/lib/merge'
import type { Customer, Pet } from '@/lib/types'
import MergeClient, { type DupGroup, type MergeLogRow } from './MergeClient'

/**
 * หน้ารวมข้อมูลซ้ำ — ไล่หาคู่ที่น่าจะเป็นคนเดียวกัน/ตัวเดียวกันมาเสนอให้ตรวจ
 *
 * ตรวจสิทธิ์ที่นี่อีกชั้นนอกจาก proxy.ts (คนที่ยิง URL ตรงก็ไม่ได้เห็น)
 * ตัวฟังก์ชันรวมใน DB ก็เช็ค is_admin() เองอีกชั้น
 */
export default async function MergePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; ids?: string }>
}) {
  if (!(await getAdmin())) redirect('/admin/dashboard')

  const { kind, ids } = await searchParams
  const supabase = await createClient()

  // ไล่ทั้งตาราง (ลูกค้า/สัตว์หลักพันแถวก็ยังเร็ว) — เทียบกันเองในหน่วยความจำ
  // ถ้าให้ DB หาคู่ซ้ำด้วย SQL จะเทียบ "ชื่อที่ตัดคำนำหน้าแล้ว" ไม่ได้
  const [customers, pets] = await Promise.all([
    fetchAll<Customer>((from, to) =>
      supabase.from('customers').select('*').order('id').range(from, to)
    ),
    fetchAll<Pet>((from, to) =>
      supabase.from('pets').select('*, customers(id, name, phone, hn)').order('id').range(from, to)
    ),
  ])

  const customerGroups: DupGroup[] = findCustomerDuplicates(customers).map((g) => ({
    reasons: g.reasons,
    rows: g.rows.map((c) => ({
      id: c.id,
      hn: c.hn,
      name: c.name,
      sub: c.phone,
      extra: [
        c.points > 0 ? `${c.points} แต้ม` : null,
        c.total_spent > 0 ? `ซื้อสะสม ฿${c.total_spent.toLocaleString('th-TH')}` : null,
      ].filter(Boolean).join(' · '),
    })),
  }))

  const petGroups: DupGroup[] = findPetDuplicates(pets).map((g) => ({
    reasons: g.reasons,
    rows: g.rows.map((p) => ({
      id: p.id,
      hn: p.hn,
      name: p.name,
      sub: p.customers?.name ?? '—',
      extra: [p.breed, p.active ? null : 'ปิดใช้งาน'].filter(Boolean).join(' · '),
    })),
  }))

  const { data: log } = await supabase
    .from('merge_log')
    .select('id, kind, kept_id, kept_hn, kept_name, merged_hn, merged_name, merged_phone, moved, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  const initialIds = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5)
  const initialKind: MergeKind = kind === 'pet' ? 'pet' : 'customer'

  return (
    <MergeClient
      customerGroups={customerGroups}
      petGroups={petGroups}
      log={(log ?? []) as MergeLogRow[]}
      initialKind={initialKind}
      initialIds={initialIds}
      totals={{ customers: customers.length, pets: pets.length }}
    />
  )
}
