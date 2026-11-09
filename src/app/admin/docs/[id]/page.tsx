import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { docDef, docFields } from '@/lib/clinicDocs'
import { petLabelOf } from '@/lib/clinicDocsData'
import type { ClinicDocument, Pet } from '@/lib/types'
import DocEditor from '../DocEditor'

// เอกสารที่เซฟไว้ — แก้ได้ภายใน 24 ชม. หลังจากนั้นเปิดดู/พิมพ์ซ้ำได้อย่างเดียว
export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: doc }, { data: profile }] = await Promise.all([
    supabase
      .from('clinic_documents')
      .select('*, pets(*, customers(id, name, phone))')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle(),
  ])

  if (!doc) notFound()
  const def = docDef(doc.doc_type)
  if (!def) notFound()

  // ช่องที่เพิ่มในนิยามทีหลัง จะไม่มีคีย์ในแถวเก่า — เติมให้ว่างไว้ ไม่ให้ input กลายเป็น uncontrolled
  const saved = (doc.data ?? {}) as Record<string, string>
  const initial: Record<string, string> = {}
  for (const f of docFields(def)) initial[f.key] = saved[f.key] ?? ''

  return (
    <DocEditor
      type={doc.doc_type}
      petId={doc.pet_id}
      petLabel={doc.pets ? petLabelOf(doc.pets as Pet) : ''}
      visitId={doc.visit_id}
      customerId={doc.customer_id}
      userId={user?.id ?? ''}
      role={profile?.role ?? 'cashier'}
      doc={doc as ClinicDocument}
      initial={initial}
      backHref={doc.visit_id ? `/admin/visits/${doc.visit_id}` : `/admin/pets/${doc.pet_id}`}
    />
  )
}
