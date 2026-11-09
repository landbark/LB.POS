'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/ProgressLink'
import { useProgress } from '@/lib/use-progress'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Lock, Printer, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/lib/confirm'
import { canExamine } from '@/lib/roles'
import { docDef, docEditLeft, docSummary, isDocEditable, DOC_EDIT_HOURS, type DocField } from '@/lib/clinicDocs'
import type { ClinicDocument } from '@/lib/types'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

// Tailwind ต้องเห็นคลาสเป็นตัวหนังสือจริง — `sm:col-span-${n}` สร้างตอนรันไม่ติด
const SPAN: Record<number, string> = {
  1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4', 6: 'sm:col-span-6',
}

/**
 * ฟอร์มกรอกเอกสารคลินิก — ใช้ทั้งตอนออกใบใหม่และตอนเปิดใบที่เซฟไว้
 * ช่องทั้งหมดมาจากนิยามใน src/lib/clinicDocs.ts (ค่าตั้งต้นดึงมาให้แล้ว แก้ทับได้ทุกช่อง)
 */
export default function DocEditor({
  type,
  petId,
  petLabel,
  visitId,
  customerId,
  userId,
  role,
  doc,
  initial,
  backHref,
}: {
  type: string
  petId: string
  /** ชื่อ + HN โชว์หัวหน้า */
  petLabel: string
  visitId: string | null
  customerId: string | null
  userId: string
  role: string
  /** ใบที่เซฟไว้แล้ว — null = ออกใบใหม่ */
  doc: ClinicDocument | null
  initial: Record<string, string>
  backHref: string
}) {
  const { push, refresh } = useProgress()
  const def = docDef(type)
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [saving, setSaving] = useState(false)
  // เวลาที่เหลือเดินทุกนาที — คิดหลัง mount เท่านั้น ไม่ให้ค่าที่ server render ไว้ชนกับฝั่ง client
  const [left, setLeft] = useState<string | null>(null)
  useEffect(() => {
    if (!doc) return
    const update = () => setLeft(docEditLeft(doc.created_at))
    update()
    const t = setInterval(update, 60_000)
    return () => clearInterval(t)
  }, [doc])

  if (!def) {
    return <p className="p-6 text-sm text-gray-500">ไม่รู้จักชนิดเอกสาร &quot;{type}&quot;</p>
  }

  // หมดเวลาแก้ (24 ชม.) หรือไม่มีสิทธิ์ตรวจรักษา = ดูอย่างเดียว — DB ล็อกด้วย trigger อีกชั้น
  const locked = doc ? !isDocEditable(doc.created_at) : false
  const readOnly = locked || !canExamine(role)

  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))

  async function save(thenPrint: boolean) {
    if (readOnly) return
    setSaving(true)
    const supabase = createClient()
    const payload = {
      data: values,
      summary: docSummary(def!, values),
      updated_by: userId,
    }

    if (doc) {
      const { error } = await supabase.from('clinic_documents').update(payload).eq('id', doc.id)
      setSaving(false)
      if (error) {
        toast.error(error.message.includes('24 ชั่วโมง') ? error.message : 'บันทึกไม่สำเร็จ')
        return
      }
      toast.success('บันทึกการแก้ไขแล้ว')
      if (thenPrint) window.open(`/print/doc/${doc.id}`, '_blank')
      refresh()
      return
    }

    const { data: created, error } = await supabase
      .from('clinic_documents')
      .insert({
        ...payload,
        doc_type: type,
        pet_id: petId,
        visit_id: visitId,
        customer_id: customerId,
        created_by: userId,
      })
      .select('id')
      .single()
    setSaving(false)

    if (error || !created) {
      toast.error(error?.message?.includes('duplicate') ? 'เลขที่เอกสารชนกัน กดบันทึกอีกครั้ง' : 'บันทึกไม่สำเร็จ')
      return
    }
    toast.success('ออกเอกสารแล้ว — เก็บไว้ในประวัติของสัตว์ตัวนี้')
    // เปิดหน้าพิมพ์ให้เลย (ถ้าเบราว์เซอร์บล็อกป๊อปอัป ยังกดปุ่มพิมพ์ที่หน้าเอกสารได้)
    if (thenPrint) window.open(`/print/doc/${created.id}`, '_blank')
    push(`/admin/docs/${created.id}`)
  }

  async function remove() {
    if (!doc) return
    if (!(await confirmDialog({
      message: `ลบเอกสาร ${doc.doc_number}?\nใช้กรณีออกผิด — ลบได้ภายใน ${DOC_EDIT_HOURS} ชม. แรกเท่านั้น`,
    })).confirmed) return
    const supabase = createClient()
    const { error } = await supabase.from('clinic_documents').delete().eq('id', doc.id)
    if (error) {
      toast.error(error.message.includes('24 ชั่วโมง') ? error.message : 'ลบไม่สำเร็จ')
      return
    }
    toast.success('ลบเอกสารแล้ว')
    push(backHref)
  }

  const renderField = (f: DocField) => (
    <div key={f.key} className={`col-span-6 ${SPAN[f.span ?? 6] ?? 'sm:col-span-6'}`}>
      <label className={labelClass}>
        {f.label}
        {f.suffix ? <span className="text-gray-400 font-normal"> ({f.suffix})</span> : null}
      </label>
      {f.type === 'textarea' ? (
        <textarea
          rows={f.rows ?? 3}
          className={inputClass}
          placeholder={f.placeholder}
          disabled={readOnly}
          value={values[f.key] ?? ''}
          onChange={(e) => set(f.key, e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          placeholder={f.placeholder}
          disabled={readOnly}
          value={values[f.key] ?? ''}
          onChange={(e) => set(f.key, e.target.value)}
        />
      )}
    </div>
  )

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
        <ArrowLeft size={15} /> กลับ
      </Link>

      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{def.title}</h1>
          <p className="text-sm text-gray-500">{petLabel}</p>
          {doc && <p className="text-xs text-gray-400 font-mono mt-0.5">{doc.doc_number}</p>}
        </div>
        {doc && (
          <a
            href={`/print/doc/${doc.id}`}
            target="_blank"
            className="flex items-center gap-1.5 shrink-0 border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            <Printer size={15} /> พิมพ์ / PDF
          </a>
        )}
      </div>

      {/* สถานะการแก้ไข */}
      {doc && (
        locked ? (
          <div className="flex items-start gap-2 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 mb-4 text-sm text-gray-600">
            <Lock size={15} className="shrink-0 mt-0.5" />
            <span>ออกเอกสารเกิน {DOC_EDIT_HOURS} ชม. แล้ว — แก้ไขหรือลบไม่ได้ พิมพ์ซ้ำได้อย่างเดียว</span>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-sm text-amber-800">
            {left ? `แก้ไขได้อีก ${left}` : 'ยังแก้ไขได้'} (เอกสารล็อกตัวเองหลังออกครบ {DOC_EDIT_HOURS} ชม.)
          </div>
        )
      )}
      {!doc && (
        <p className="text-xs text-gray-500 mb-4">
          ดึงข้อมูลจากทะเบียนสัตว์และใบตรวจมาให้แล้ว — แก้/เพิ่มได้ทุกช่อง กดบันทึกแล้วเอกสารจะเก็บติด HN นี้ไว้ และแก้ได้อีก {DOC_EDIT_HOURS} ชม.
        </p>
      )}

      <div className="space-y-4">
        {def.sections.map((section, si) => (
          <div key={si} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            {section.heading && <h2 className="text-sm font-semibold text-gray-900 mb-3">{section.heading}</h2>}
            <div className="grid grid-cols-6 gap-3">{section.fields.map(renderField)}</div>
          </div>
        ))}
      </div>

      {/* ข้อความยินยอมที่จะพิมพ์ลงเอกสาร — อ่านให้เจ้าของก่อนเซ็น */}
      {def.body && def.body.length > 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mt-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">ข้อความที่จะพิมพ์ลงเอกสาร</h2>
          {def.body.map((p, i) => (
            <p key={i} className="text-xs text-gray-600 mb-2 text-justify">{p}</p>
          ))}
          <p className="text-xs text-gray-400">ช่องลงนาม: {def.signatures.join(' · ')}</p>
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
          >
            <Printer size={17} /> {doc ? 'บันทึกแล้วพิมพ์' : 'บันทึกและพิมพ์'}
          </button>
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="flex items-center justify-center gap-2 border border-gray-300 text-gray-700 font-medium px-4 py-3 rounded-xl hover:bg-gray-50 disabled:opacity-50"
          >
            <Save size={17} /> บันทึก
          </button>
        </div>
      )}

      {doc && !readOnly && (
        <div className="text-center mt-6">
          <button onClick={remove} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-600">
            <Trash2 size={14} /> ลบเอกสารนี้ (ออกผิด)
          </button>
        </div>
      )}
    </div>
  )
}
