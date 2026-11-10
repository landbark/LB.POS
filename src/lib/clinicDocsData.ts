// ประกอบข้อมูลตั้งต้นของเอกสารคลินิก (ฝั่ง server) — ใช้ตอนเปิดฟอร์มออกใบใหม่
// แยกจาก clinicDocs.ts เพราะไฟล์นั้นเป็นนิยามล้วน ๆ (client ก็ import ได้)

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pet, PetVaccination, Visit, VisitItem } from './types'
import type { DocContext, DocHistoryEntry } from './clinicDocs'

/** รายการยาในใบตรวจ → บรรทัด "ชื่อยา — วิธีใช้" สำหรับใบส่งตัว/ใบสรุปการรักษา */
function medsFrom(items: VisitItem[]): string[] {
  return items
    .filter((i) => !i.products?.is_service)
    .map((i) => {
      const inject = i.dose_ml != null ? `ฉีด ${i.dose_ml} ml` : null
      const sig = [inject, i.dosage?.trim()].filter(Boolean).join(' · ')
      const name = i.products?.name ?? 'ยา'
      const qty = i.quantity ? ` × ${i.quantity} ${i.products?.unit ?? ''}`.trimEnd() : ''
      return sig ? `${name}${qty} — ${sig}` : `${name}${qty}`
    })
}

/**
 * ดึงสัตว์ + เจ้าของ + ใบตรวจ (ถ้าออกเอกสารจากหน้าตรวจรักษา) + ประวัติ + วัคซีน
 * คืน null ถ้าหาสัตว์ไม่เจอ
 */
export async function loadDocContext(
  supabase: SupabaseClient,
  { petId, visitId }: { petId?: string; visitId?: string }
): Promise<{ ctx: DocContext; petId: string; customerId: string | null } | null> {
  let visit: Visit | null = null

  if (visitId) {
    const { data } = await supabase
      .from('visits')
      .select(`
        *,
        pets(*, customers(id, name, phone)),
        customers(id, name, phone),
        visit_items(*, products(name, unit, is_service)),
        visit_diagnoses(diagnoses(*))
      `)
      .eq('id', visitId)
      .maybeSingle()
    visit = (data as Visit) ?? null
  }

  const resolvedPetId = visit?.pet_id ?? petId
  if (!resolvedPetId) return null

  let pet = visit?.pets ?? null
  if (!pet) {
    const { data } = await supabase
      .from('pets')
      .select('*, customers(id, name, phone)')
      .eq('id', resolvedPetId)
      .maybeSingle()
    pet = (data as Pet) ?? null
  }
  if (!pet) return null

  const customer = visit?.customers ?? pet.customers ?? null

  const [{ data: history }, { data: vaccinations }, { data: ownerRow }, { data: address }] = await Promise.all([
    supabase
      .from('visits')
      .select('visit_date, diagnosis, treatment, visit_diagnoses(diagnoses(*))')
      .eq('pet_id', resolvedPetId)
      .neq('id', visitId ?? '00000000-0000-0000-0000-000000000000')
      .neq('status', 'cancelled')
      .order('visit_date', { ascending: false })
      .limit(5),
    supabase.from('pet_vaccinations').select('*').eq('pet_id', resolvedPetId).order('dose_date', { ascending: false }),
    // ที่อยู่ + นามสกุลของลูกค้า — แยก query เผื่อยังไม่ได้รัน migration ที่เพิ่มคอลัมน์นี้
    customer
      ? supabase.from('customers').select('address, last_name').eq('id', customer.id).maybeSingle()
      : Promise.resolve({ data: null }),
    // ไม่มีที่อยู่ข้อความค่อยถอยไปใช้ที่อยู่จัดส่งของร้านออนไลน์
    customer
      ? supabase
          .from('customer_addresses')
          .select('address_line, subdistrict, district, province, postal_code')
          .eq('customer_id', customer.id)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // น้ำหนัก: ใบตรวจนี้ก่อน ไม่ได้ชั่งค่อยย้อนใบก่อน
  let weight = visit?.weight ?? null
  if (weight == null) {
    const { data: lastWeight } = await supabase
      .from('visits')
      .select('weight')
      .eq('pet_id', resolvedPetId)
      .not('weight', 'is', null)
      .order('visit_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    weight = lastWeight?.weight ?? null
  }

  const addr = address as { address_line: string; subdistrict: string | null; district: string | null; province: string; postal_code: string | null } | null

  const owner = ownerRow as { address?: string | null; last_name?: string | null } | null
  // เอกสารราชการ/ใบรับรองใช้ชื่อเต็ม — ที่อื่น (ใบเสร็จ/ฉลากยา) ยังใช้ชื่อเดี่ยวเหมือนเดิม
  const ownerLastName = owner?.last_name?.trim()

  const ctx: DocContext = {
    pet,
    owner: customer
      ? {
          name: [customer.name, ownerLastName].filter(Boolean).join(' '),
          phone: customer.phone ?? null,
          address: owner?.address?.trim()
            || (addr
              ? [addr.address_line, addr.subdistrict, addr.district, addr.province, addr.postal_code].filter(Boolean).join(' ')
              : null),
        }
      : null,
    visit,
    weight,
    history: (history ?? []) as DocHistoryEntry[],
    vaccinations: (vaccinations ?? []) as PetVaccination[],
    meds: medsFrom((visit?.visit_items ?? []) as VisitItem[]),
    vetName: null,
  }

  return { ctx, petId: resolvedPetId, customerId: customer?.id ?? null }
}

/** ชื่อ + HN โชว์หัวฟอร์ม */
export function petLabelOf(pet: Pet): string {
  return [pet.name, pet.hn ? `HN ${pet.hn}` : null, pet.customers?.name].filter(Boolean).join(' · ')
}
