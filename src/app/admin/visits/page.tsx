import { createClient } from '@/lib/supabase/server'
import VisitsClient from './VisitsClient'

export default async function VisitsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: visits }, { data: pets }] = await Promise.all([
    supabase
      .from('visits')
      .select('*, pets(id, name, species, breed), customers(id, name, phone), vet:profiles!visits_vet_id_fkey(name)')
      .order('visit_date', { ascending: false })
      .limit(200),
    supabase
      .from('pets')
      .select('*, customers(id, name, phone)')
      .eq('active', true)
      .order('name'),
  ])

  return <VisitsClient visits={visits ?? []} pets={pets ?? []} userId={user?.id ?? ''} />
}
