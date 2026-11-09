'use client'

import Link from '@/components/ProgressLink'
import { FileText, Lock, Printer } from 'lucide-react'
import { DOC_TYPES, docDef, isDocEditable } from '@/lib/clinicDocs'
import { canExamine } from '@/lib/roles'
import type { ClinicDocument } from '@/lib/types'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })

/**
 * เอกสารคลินิกของสัตว์ตัวหนึ่ง — ปุ่มออกใบใหม่ + ลิสต์ที่เคยออกไว้
 * ใช้ทั้งในหน้าตรวจรักษา (ผูก visit ให้ด้วย) และหน้าทะเบียนสัตว์
 */
export default function ClinicDocsSection({
  petId,
  visitId,
  docs,
  role,
  /** หน้าตรวจรักษา: ไฮไลต์ใบที่ออกจากใบตรวจนี้ */
  highlightVisitId,
}: {
  petId: string
  visitId?: string | null
  docs: ClinicDocument[]
  role: string
  highlightVisitId?: string | null
}) {
  const canCreate = canExamine(role)
  const newHref = (type: string) =>
    visitId ? `/admin/docs/new?type=${type}&visit=${visitId}` : `/admin/docs/new?type=${type}&pet=${petId}`

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <FileText size={15} className="text-gray-400" /> เอกสารคลินิก
      </h2>

      {canCreate ? (
        <>
          <p className="text-xs text-gray-500 mb-2">กรอกในระบบ → เซฟติด HN นี้ → พิมพ์หรือบันทึกเป็น PDF (แก้ได้ 24 ชม.)</p>
          <div className="flex flex-wrap gap-2">
            {DOC_TYPES.map((d) => (
              <Link
                key={d.type}
                href={newHref(d.type)}
                className="flex items-center gap-1.5 border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-lg hover:bg-gray-50 hover:border-blue-300"
              >
                <FileText size={14} className="text-gray-400" /> {d.short}
              </Link>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-500 mb-2">ออกเอกสารได้เฉพาะสัตวแพทย์/แอดมิน — ที่ออกไว้แล้วเปิดพิมพ์ซ้ำได้</p>
      )}

      {docs.length > 0 && (
        <div className="mt-3 divide-y divide-gray-50 border-t border-gray-100">
          {docs.map((doc) => {
            const def = docDef(doc.doc_type)
            const editable = isDocEditable(doc.created_at)
            return (
              <div
                key={doc.id}
                className={`flex items-start gap-2 py-2 ${highlightVisitId && doc.visit_id === highlightVisitId ? 'bg-blue-50/50 rounded px-1' : ''}`}
              >
                <Link href={`/admin/docs/${doc.id}`} className="flex-1 min-w-0 hover:opacity-70">
                  <p className="text-sm text-gray-900">
                    {def?.short ?? doc.doc_type}
                    <span className="text-xs text-gray-400 font-mono ml-2">{doc.doc_number}</span>
                  </p>
                  {doc.summary && <p className="text-xs text-gray-600 truncate">{doc.summary}</p>}
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    {fmtDate(doc.created_at)}
                    {/* เวลาที่เหลือแบบละเอียดอยู่ในหน้าเอกสาร — ที่นี่บอกแค่สถานะ ไม่ให้ค่าที่ render
                        ฝั่ง server กับ client ต่างกันตอน hydrate */}
                    {editable
                      ? <span className="text-amber-600">· ยังแก้ไขได้</span>
                      : <span className="flex items-center gap-0.5"><Lock size={10} /> ล็อกแล้ว</span>}
                  </p>
                </Link>
                <a
                  href={`/print/doc/${doc.id}`}
                  target="_blank"
                  title="พิมพ์ / บันทึกเป็น PDF"
                  className="shrink-0 text-gray-400 hover:text-blue-600 p-1.5"
                >
                  <Printer size={16} />
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
