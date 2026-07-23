import { createClient } from '@/lib/supabase/server'
import AppointmentsClient from './AppointmentsClient'

export default async function AppointmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: appointments }, { data: pets }] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, pets(id, name, species), customers(id, name, phone), vet:profiles!appointments_vet_id_fkey(name)')
      .order('scheduled_at')
      .limit(500),
    supabase.from('pets').select('*, customers(id, name, phone)').eq('active', true).order('name'),
  ])

  return <AppointmentsClient appointments={appointments ?? []} pets={pets ?? []} userId={user?.id ?? ''} />
}
