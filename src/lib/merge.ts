import type { SupabaseClient } from '@supabase/supabase-js'
import type { Customer, Pet } from '@/lib/types'

export type MergeKind = 'customer' | 'pet'

/** คอลัมน์ที่หน้าเปรียบเทียบเลือกทับได้ — ต้องตรงกับ whitelist ในฟังก์ชัน SQL */
export const CUSTOMER_PICK_FIELDS = ['name', 'last_name', 'phone', 'hn', 'address'] as const
export const PET_PICK_FIELDS = [
  'name', 'species', 'breed', 'sex', 'birth_date', 'color', 'microchip',
  'sterilized', 'sterilized_date', 'allergies', 'chronic_conditions', 'caution', 'notes',
] as const

/** ตารางที่อ้างถึงลูกค้า / สัตว์ → ป้ายที่พนักงานอ่านเข้าใจ */
export const COUNT_TABLES: Record<MergeKind, { table: string; column: string; label: string }[]> = {
  customer: [
    { table: 'pets', column: 'customer_id', label: 'สัตว์เลี้ยง' },
    { table: 'visits', column: 'customer_id', label: 'ประวัติตรวจรักษา' },
    { table: 'transactions', column: 'customer_id', label: 'บิลขาย' },
    { table: 'appointments', column: 'customer_id', label: 'นัดหมาย' },
    { table: 'orders', column: 'customer_id', label: 'ออเดอร์ออนไลน์' },
    { table: 'customer_addresses', column: 'customer_id', label: 'ที่อยู่จัดส่ง' },
  ],
  pet: [
    { table: 'visits', column: 'pet_id', label: 'ประวัติตรวจรักษา' },
    { table: 'pet_vaccinations', column: 'pet_id', label: 'ประวัติวัคซีน' },
    { table: 'appointments', column: 'pet_id', label: 'นัดหมาย' },
    { table: 'clinic_documents', column: 'pet_id', label: 'เอกสารคลินิก' },
  ],
}

export const COUNT_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(COUNT_TABLES).flat().map((t) => [t.table, t.label])
)

/**
 * ชื่อคนไทยในระบบมีคำนำหน้าปะปนและเว้นวรรคไม่เท่ากัน
 * ("คุณสมชาย" / "สมชาย " / "พี่สมชาย" คือคนเดียวกัน) — ตัดออกก่อนเทียบ
 *
 * ใช้ "เดา" ว่าน่าจะซ้ำเท่านั้น คนกดรวมยังต้องยืนยันเองทุกครั้ง
 */
const TITLES = [
  'นางสาว', 'เด็กชาย', 'เด็กหญิง', 'คุณ', 'นาย', 'นาง', 'น.ส.', 'ด.ช.', 'ด.ญ.',
  'พี่', 'น้อง', 'khun', 'mr.', 'mrs.', 'ms.', 'miss', 'mr', 'mrs', 'ms', 'k.',
]

export function nameKey(raw: string | null | undefined): string {
  let s = (raw ?? '').toLowerCase().replace(/[\s.\-_()]+/g, '')
  for (const t of TITLES) {
    const key = t.replace(/[\s.]+/g, '')
    if (key && s.startsWith(key) && s.length > key.length) {
      s = s.slice(key.length)
      break
    }
  }
  return s
}

/** เบอร์เดียวกันแต่คนละรูปแบบ (0812345678 / 66812345678 / 081-234-5678) */
export function phoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D+/g, '')
  return digits.length >= 9 ? digits.slice(-9) : digits
}

/** union-find — รายการหนึ่งอาจซ้ำกับอีกรายการด้วยเหตุผลต่างกัน ต้องรวมเป็นกลุ่มเดียว */
class Groups {
  private parent = new Map<string, string>()
  private reasons = new Map<string, Set<string>>()

  private find(id: string): string {
    const up = this.parent.get(id)
    if (up === undefined || up === id) {
      this.parent.set(id, id)
      return id
    }
    const root = this.find(up)
    this.parent.set(id, root)
    return root
  }

  link(a: string, b: string, reason: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) {
      this.parent.set(rb, ra)
      const moved = this.reasons.get(rb)
      if (moved) {
        const into = this.reasons.get(ra) ?? new Set<string>()
        moved.forEach((r) => into.add(r))
        this.reasons.set(ra, into)
        this.reasons.delete(rb)
      }
    }
    const root = this.find(a)
    const set = this.reasons.get(root) ?? new Set<string>()
    set.add(reason)
    this.reasons.set(root, set)
  }

  collect<T extends { id: string }>(rows: T[]): { ids: string[]; reasons: string[]; rows: T[] }[] {
    const byRoot = new Map<string, T[]>()
    for (const row of rows) {
      if (!this.parent.has(row.id)) continue
      const root = this.find(row.id)
      ;(byRoot.get(root) ?? byRoot.set(root, []).get(root)!).push(row)
    }
    return [...byRoot.entries()]
      .filter(([, members]) => members.length > 1)
      .map(([root, members]) => ({
        ids: members.map((m) => m.id),
        reasons: [...(this.reasons.get(root) ?? [])],
        rows: members,
      }))
  }
}

/** จับคู่ลูกค้าที่น่าจะเป็นคนเดียวกัน — ชื่อตรงกัน หรือเบอร์เดียวกันคนละรูปแบบ */
export function findCustomerDuplicates(customers: Customer[]) {
  const groups = new Groups()

  const byName = new Map<string, Customer[]>()
  const byPhone = new Map<string, Customer[]>()

  for (const c of customers) {
    const nk = nameKey(c.name)
    if (nk.length >= 2) (byName.get(nk) ?? byName.set(nk, []).get(nk)!).push(c)
    const pk = phoneKey(c.phone)
    if (pk.length >= 9) (byPhone.get(pk) ?? byPhone.set(pk, []).get(pk)!).push(c)
  }

  for (const members of byName.values()) {
    for (let i = 1; i < members.length; i++) groups.link(members[0].id, members[i].id, 'ชื่อเดียวกัน')
  }
  for (const members of byPhone.values()) {
    for (let i = 1; i < members.length; i++) groups.link(members[0].id, members[i].id, 'เบอร์โทรเดียวกัน')
  }

  return groups.collect(customers)
}

/** จับคู่สัตว์ที่น่าจะเป็นตัวเดียวกัน — ลงซ้ำใต้เจ้าของคนเดิม, ไมโครชิปเดียวกัน, หรือเจ้าของซ้ำกันอยู่ */
export function findPetDuplicates(pets: Pet[]) {
  const groups = new Groups()

  const byOwnerName = new Map<string, Pet[]>()
  const byChip = new Map<string, Pet[]>()
  const byOwnerKeyName = new Map<string, Pet[]>()

  for (const p of pets) {
    const pk = nameKey(p.name)
    if (pk.length < 1) continue

    const k1 = `${p.customer_id}|${pk}`
    ;(byOwnerName.get(k1) ?? byOwnerName.set(k1, []).get(k1)!).push(p)

    const chip = (p.microchip ?? '').replace(/\s+/g, '')
    if (chip.length >= 6) (byChip.get(chip) ?? byChip.set(chip, []).get(chip)!).push(p)

    const ownerKey = nameKey(p.customers?.name)
    if (ownerKey.length >= 2) {
      const k3 = `${ownerKey}|${pk}|${p.species}`
      ;(byOwnerKeyName.get(k3) ?? byOwnerKeyName.set(k3, []).get(k3)!).push(p)
    }
  }

  for (const members of byOwnerName.values()) {
    for (let i = 1; i < members.length; i++) groups.link(members[0].id, members[i].id, 'เจ้าของคนเดียวกัน ชื่อสัตว์เหมือนกัน')
  }
  for (const members of byChip.values()) {
    for (let i = 1; i < members.length; i++) groups.link(members[0].id, members[i].id, 'ไมโครชิปเดียวกัน')
  }
  for (const members of byOwnerKeyName.values()) {
    for (let i = 1; i < members.length; i++) {
      if (members[0].customer_id === members[i].customer_id) continue
      groups.link(members[0].id, members[i].id, 'ชื่อเจ้าของกับชื่อสัตว์ตรงกัน (เจ้าของยังเป็นคนละใบ)')
    }
  }

  return groups.collect(pets)
}

/**
 * ของเก่าที่ถูกรวมหายไปแล้ว ต้องยังค้นเจอว่าไปอยู่กับใคร
 *
 * HN เก่าอยู่ในเวชระเบียนกระดาษ และแคชเชียร์ก็ยังพิมพ์เบอร์เดิมของลูกค้า —
 * ถ้าค้นไม่เจอ พนักงานจะเพิ่มใบใหม่ กลายเป็นซ้ำอีกรอบ
 * (merge_log เปิดให้พนักงานที่อนุมัติแล้วอ่านได้ ดู supabase-migration-merge-duplicates.sql)
 */
export interface MergeHit {
  kept_id: string
  merged_hn: string | null
  merged_name: string | null
  merged_phone: string | null
}

export async function findMergedByTerm(
  supabase: SupabaseClient,
  kind: MergeKind,
  term: string,
  limit = 5
): Promise<MergeHit[]> {
  const raw = term.trim()
  if (!raw) return []

  const like = `%${raw.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const { data } = await supabase
    .from('merge_log')
    .select('kept_id, merged_hn, merged_name, merged_phone')
    .eq('kind', kind)
    .or(`merged_hn.ilike.${like},merged_name.ilike.${like},merged_phone.ilike.${like}`)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as MergeHit[]
}

/** ข้อความบอกพนักงานว่าของเก่าที่ค้นหาถูกรวมไปแล้ว */
export function mergedNote(hits: MergeHit[], kind: MergeKind): string | null {
  if (hits.length === 0) return null
  const what = kind === 'pet' ? 'สัตว์' : 'ลูกค้า'
  const labels = hits
    .map((h) => [h.merged_hn, h.merged_name, h.merged_phone].filter(Boolean).join(' · '))
    .filter(Boolean)
  return `${what}ที่ค้นหา (${labels.join(' / ')}) ถูกรวมเข้ากับรายการด้านล่างแล้ว`
}

/** เบอร์ที่ถูกรวมหายไป → id ของลูกค้าตัวจริงที่เก็บไว้ (ใช้ที่หน้าขาย) */
export async function keptIdForMergedPhone(
  supabase: SupabaseClient,
  phone: string
): Promise<string | null> {
  const { data } = await supabase
    .from('merge_log')
    .select('kept_id')
    .eq('kind', 'customer')
    .eq('merged_phone', phone.trim())
    .order('created_at', { ascending: false })
    .limit(1)

  return data?.[0]?.kept_id ?? null
}

/**
 * ค้นไม่เจอด้วยคำที่พิมพ์ → ลองดูว่าเป็นของเก่าที่ถูกรวมไปแล้วหรือเปล่า
 *
 * ใช้ที่หน้ารายการลูกค้า/สัตว์และช่องเลือกต่าง ๆ — loader รับ id ของตัวที่เก็บไว้
 * ไปดึงแถวจริงมา เพราะแต่ละที่ select คอลัมน์ไม่เหมือนกัน
 */
export async function mergedFallback<T>(
  supabase: SupabaseClient,
  kind: MergeKind,
  term: string,
  loader: (keptIds: string[]) => PromiseLike<{ data: T[] | null }>
): Promise<{ rows: T[]; note: string | null }> {
  const hits = await findMergedByTerm(supabase, kind, term)
  if (hits.length === 0) return { rows: [], note: null }

  const { data } = await loader([...new Set(hits.map((h) => h.kept_id))])
  const rows = data ?? []
  return { rows, note: rows.length > 0 ? mergedNote(hits, kind) : null }
}
