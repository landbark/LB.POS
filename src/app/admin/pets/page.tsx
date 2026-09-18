import { createClient } from '@/lib/supabase/server'
import PetsClient from './PetsClient'
import type { Pet } from '@/lib/types'

/** สัตว์เลี้ยงโตได้ไม่จำกัด — ค้นที่ server แล้วส่งมาทีละหน้า */
const PAGE_SIZE = 100

export default async function PetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()
  const term = (q ?? '').trim()

  const columns = '*, customers(id, name, phone)'
  let pets: Pet[] = []

  if (term) {
    const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    // เงื่อนไขบนตารางที่ join มาใส่รวมใน .or() เดียวกันไม่ได้ ต้องยิงสองรอบแล้วรวมผล
    const [byPet, byOwner] = await Promise.all([
      supabase.from('pets').select(columns).eq('active', true)
        .or(`name.ilike.${like},breed.ilike.${like},microchip.ilike.${like}`)
        .order('created_at', { ascending: false }).limit(PAGE_SIZE),
      supabase.from('pets').select('*, customers!inner(id, name, phone)').eq('active', true)
        .or(`name.ilike.${like},phone.ilike.${like}`, { referencedTable: 'customers' })
        .order('created_at', { ascending: false }).limit(PAGE_SIZE),
    ])

    const seen = new Set<string>()
    pets = ([...(byPet.data ?? []), ...(byOwner.data ?? [])] as unknown as Pet[])
      .filter((p) => !seen.has(p.id) && seen.add(p.id))
      .slice(0, PAGE_SIZE)
  } else {
    const { data } = await supabase.from('pets').select(columns).eq('active', true)
      .order('created_at', { ascending: false }).limit(PAGE_SIZE)
    pets = (data ?? []) as unknown as Pet[]
  }

  // สายพันธุ์เป็นรายการอ้างอิงคงที่ (ไม่กี่สิบแถว) โหลดทั้งก้อนได้
  const { data: breeds } = await supabase.from('breeds').select('*').order('name')

  return (
    <PetsClient
      pets={pets}
      breeds={breeds ?? []}
      searching={term.length > 0}
      atLimit={pets.length === PAGE_SIZE}
      pageSize={PAGE_SIZE}
    />
  )
}
