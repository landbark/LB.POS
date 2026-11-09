'use client'

import { useState } from 'react'
import PrintToolbar from '@/components/PrintToolbar'
import type { ClinicDocument, StoreSettings } from '@/lib/types'
import { docDef, type DocField } from '@/lib/clinicDocs'

const DOTS = '……………………………………'

/** ช่องแบบบรรทัดเดียว — ว่างก็ยังขึ้นเส้นให้เขียนมือหน้างาน */
function InlineField({ field, value }: { field: DocField; value: string }) {
  return (
    <span className="inline-block mr-5 whitespace-nowrap">
      <span className="text-gray-500">{field.label}: </span>
      <span className={value ? 'font-medium' : 'text-gray-400'}>{value || DOTS}</span>
      {value && field.suffix ? <span className="text-gray-500"> {field.suffix}</span> : null}
    </span>
  )
}

export default function DocPrintView({ doc, store }: { doc: ClinicDocument; store: StoreSettings | null }) {
  const [size, setSize] = useState<'a4'>('a4')
  const def = docDef(doc.doc_type)
  const data = doc.data ?? {}

  if (!def) {
    return <p className="p-8 text-sm text-gray-500">ไม่รู้จักชนิดเอกสาร &quot;{doc.doc_type}&quot;</p>
  }

  const issued = new Date(doc.created_at).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  })

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @page { size: A4; margin: 15mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <PrintToolbar
        backHref={`/admin/docs/${doc.id}`}
        size={size}
        onSizeChange={(v) => setSize(v as 'a4')}
        sizes={[{ value: 'a4', label: 'A4' }]}
        fileName={doc.doc_number}
      />

      <div className="flex justify-center py-6 print:py-0">
        <div className="bg-white shadow-lg print:shadow-none p-10 print:p-0" style={{ width: '720px', maxWidth: '100%', fontSize: '14px', lineHeight: 1.7 }}>
          {/* หัวร้าน */}
          <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b-2 border-gray-800">
            <div className="flex items-center gap-3">
              {store?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logo_url} alt={store.name} className="h-14 w-14 object-contain shrink-0" />
              )}
              <div>
                <p className="font-bold" style={{ fontSize: '1.2em' }}>{store?.name ?? 'LANDBARK'}</p>
                {store?.address && <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.82em' }}>{store.address}</p>}
                {store?.phone && <p className="text-gray-600" style={{ fontSize: '0.82em' }}>โทร {store.phone}</p>}
              </div>
            </div>
            <p className="text-gray-500 font-mono shrink-0" style={{ fontSize: '0.8em' }}>{doc.doc_number}</p>
          </div>

          <h1 className="text-center font-bold mb-1" style={{ fontSize: '1.25em' }}>{def.title}</h1>
          {def.subtitle && <p className="text-center text-gray-500 mb-5" style={{ fontSize: '0.85em' }}>{def.subtitle}</p>}

          {/* เนื้อเอกสาร */}
          {def.sections.map((section, si) => {
            const inline = section.fields.filter((f) => f.type !== 'textarea')
            const blocks = section.fields.filter((f) => f.type === 'textarea')
            const shownBlocks = blocks.filter((f) => (data[f.key] ?? '').trim() !== '' || f.keepBlank)
            if (inline.length === 0 && shownBlocks.length === 0) return null

            return (
              <div key={si} className="mb-4">
                {section.heading && (
                  <p className="font-semibold text-gray-700 mb-1 pb-0.5 border-b border-gray-200" style={{ fontSize: '0.9em' }}>
                    {section.heading}
                  </p>
                )}
                {inline.length > 0 && (
                  <p style={{ fontSize: '0.95em', lineHeight: 2 }}>
                    {inline.map((f) => <InlineField key={f.key} field={f} value={(data[f.key] ?? '').trim()} />)}
                  </p>
                )}
                {shownBlocks.map((f) => (
                  <div key={f.key} className="mt-1.5">
                    <p className="text-gray-500" style={{ fontSize: '0.9em' }}>{f.label}:</p>
                    <p className="whitespace-pre-line pl-2" style={{ minHeight: '1.6em' }}>
                      {(data[f.key] ?? '').trim() || <span className="text-gray-300">{DOTS}{DOTS}</span>}
                    </p>
                  </div>
                ))}
              </div>
            )
          })}

          {/* ข้อความยินยอม / คำรับรอง */}
          {def.body && def.body.length > 0 && (
            <div className="mb-5 mt-4 text-justify" style={{ fontSize: '0.95em' }}>
              {def.body.map((p, i) => <p key={i} className="mb-2">{p}</p>)}
            </div>
          )}

          {/* ลงนาม */}
          <div
            className={`mt-10 gap-8 ${def.signatures.length === 1 ? 'flex justify-end' : 'grid grid-cols-2'}`}
            style={{ fontSize: '0.9em' }}
          >
            {def.signatures.map((label) => (
              <div key={label} className="text-center" style={def.signatures.length === 1 ? { width: '260px' } : undefined}>
                <div className="border-b border-gray-500 mb-1 h-6" />
                <p className="text-gray-600">{label}</p>
                {label !== 'วันที่' && <p className="text-gray-400 mt-1">(...........................)</p>}
              </div>
            ))}
          </div>

          <p className="text-gray-400 mt-8 pt-2 border-t border-gray-100" style={{ fontSize: '0.72em' }}>
            เลขที่ {doc.doc_number} · ออกเมื่อ {issued}
            {doc.profiles?.name ? ` · โดย ${doc.profiles.name}` : ''}
            {doc.pets?.hn ? ` · HN ${doc.pets.hn}` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
