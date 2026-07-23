import { createClient } from '@/lib/supabase/server'
import PetsClient from './PetsClient'

export default async function PetsPage() {
  const supabase = await createClient()

  const [{ data: pets }, { data: customers }, { data: breeds }] = await Promise.all([
    supabase
      .from('pets')
      .select('*, customers(id, name, phone)')
      .eq('active', true)
      .order('created_at', { ascending: false }),
    supabase.from('customers').select('id, name, phone').order('name'),
    supabase.from('breeds').select('*').order('name'),
  ])

  return <PetsClient pets={pets ?? []} customers={customers ?? []} breeds={breeds ?? []} />
}
