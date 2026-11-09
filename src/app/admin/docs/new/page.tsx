import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildPrefill, docDef } from '@/lib/clinicDocs'
import { loadDocContext, petLabelOf } from '@/lib/clinicDocsData'
import { canExamine } from '@/lib/roles'
import DocEditor from '../DocEditor'

// ออกเอกสารใบใหม่: /admin/docs/new?type=referral&visit=<id>  (หรือ &pet=<id> ถ้าออกจากหน้าสัตว์)
export default async function NewDocPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; pet?: string; visit?: string }>
}) {
  const { type, pet: petParam, visit: visitParam } = await searchParams
  if (!type || !docDef(type)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle()
  const role = profile?.role ?? 'cashier'

  // ออกเอกสารได้เฉพาะหมอ/แอดมิน — แคชเชียร์เปิดดู/พิมพ์ซ้ำของที่ออกไว้แล้วได้
  if (!canExamine(role)) redirect(petParam ? `/admin/pets/${petParam}` : '/admin/visits')

  const loaded = await loadDocContext(supabase, { petId: petParam, visitId: visitParam })
  if (!loaded) notFound()

  const def = docDef(type)!
  const backHref = visitParam ? `/admin/visits/${visitParam}` : `/admin/pets/${loaded.petId}`

  return (
    <DocEditor
      type={type}
      petId={loaded.petId}
      petLabel={petLabelOf(loaded.ctx.pet)}
      visitId={visitParam ?? null}
      customerId={loaded.customerId}
      userId={user?.id ?? ''}
      role={role}
      doc={null}
      initial={buildPrefill(def, loaded.ctx)}
      backHref={backHref}
    />
  )
}
