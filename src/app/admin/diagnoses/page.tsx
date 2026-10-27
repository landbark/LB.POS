import { createClient } from '@/lib/supabase/server'
import DiagnosesClient from './DiagnosesClient'
import { canExamine } from '@/lib/roles'

export default async function DiagnosesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: diagnoses }, { data: links }, { data: profile }] = await Promise.all([
    supabase.from('diagnoses').select('*').order('name'),
    // นับว่าโรคไหนถูกใช้กี่ครั้ง — แถวเล็ก (โรคต่อ visit) ดึงมานับฝั่ง server ทีเดียวพอ
    supabase.from('visit_diagnoses').select('diagnosis_id').limit(10000),
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').single(),
  ])

  const usage: Record<string, number> = {}
  for (const l of links ?? []) usage[l.diagnosis_id] = (usage[l.diagnosis_id] ?? 0) + 1

  return (
    <DiagnosesClient
      diagnoses={diagnoses ?? []}
      usage={usage}
      canManage={canExamine(profile?.role)}
    />
  )
}
