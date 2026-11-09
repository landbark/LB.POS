import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ClinicDocument } from '@/lib/types'
import DocPrintView from './DocPrintView'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('clinic_documents').select('doc_number').eq('id', id).maybeSingle()
  return { title: data?.doc_number ?? 'เอกสารคลินิก' }
}

// เอกสารคลินิกที่เซฟไว้ — อ่านค่าจาก clinic_documents.data ไม่มีช่องกรอกในหน้านี้
// (กรอก/แก้ที่ /admin/docs/[id] ภายใน 24 ชม. หน้านี้คือฉบับที่พิมพ์/บันทึกเป็น PDF)
export default async function DocPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: doc }, { data: store }] = await Promise.all([
    supabase
      .from('clinic_documents')
      .select('*, pets(id, hn, name), profiles:created_by(name)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('store_settings').select('*').limit(1).single(),
  ])

  if (!doc) notFound()

  return <DocPrintView doc={doc as ClinicDocument} store={store} />
}
