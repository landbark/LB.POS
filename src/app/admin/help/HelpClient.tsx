'use client'

import { Printer } from 'lucide-react'
import { SECTIONS, type Block } from './content'

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'p':
            return <p key={i} className="text-sm text-gray-700 mb-2.5 leading-relaxed">{b.text}</p>
          case 'h':
            return <h3 key={i} className="text-sm font-semibold text-gray-900 mt-4 mb-1.5">{b.text}</h3>
          case 'steps':
            return (
              <ol key={i} className="list-decimal pl-5 mb-3 space-y-1 text-sm text-gray-700 marker:text-[#C4865A] marker:font-semibold">
                {b.items.map((t, j) => <li key={j} className="pl-0.5 leading-relaxed">{t}</li>)}
              </ol>
            )
          case 'bullets':
            return (
              <ul key={i} className="list-disc pl-5 mb-3 space-y-1 text-sm text-gray-700 marker:text-[#C4865A]">
                {b.items.map((t, j) => <li key={j} className="pl-0.5 leading-relaxed">{t}</li>)}
              </ul>
            )
          case 'note':
          case 'warn':
            return (
              <div
                key={i}
                className={`rounded-lg px-4 py-3 mb-3 border-l-4 ${
                  b.kind === 'warn' ? 'bg-red-50 border-red-400' : 'bg-[#FDF6EE] border-[#C4865A]'
                }`}
              >
                <p className={`text-sm font-semibold mb-1 ${b.kind === 'warn' ? 'text-red-800' : 'text-[#7A4E2D]'}`}>
                  {b.title}
                </p>
                {b.lines.map((t, j) => (
                  <p key={j} className="text-sm text-gray-700 leading-relaxed mb-1 last:mb-0">{t}</p>
                ))}
              </div>
            )
          case 'table':
            return (
              <div key={i} className="overflow-x-auto mb-3">
                <table className="w-full text-sm border border-[#E8D5C0] rounded-lg overflow-hidden">
                  <thead className="bg-[#F0E4D4]">
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} className="text-left font-semibold text-[#6B4A2E] px-3 py-2 border-b border-[#E8D5C0]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j} className="odd:bg-white even:bg-[#FDFAF6]">
                        {row.map((cell, k) => (
                          <td key={k} className="px-3 py-2 align-top text-gray-700 border-b border-[#F0E4D4] last:border-r-0">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      })}
    </>
  )
}

export default function HelpClient() {
  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">คู่มือพนักงาน</h1>
        <button
          onClick={() => window.print()}
          className="print:hidden shrink-0 flex items-center gap-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm px-3 py-1.5 rounded-lg"
        >
          <Printer size={15} /> พิมพ์
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        เรียงตามลำดับงานจริงของวัน ตั้งแต่เปิดร้านจนปิดร้าน ถ้าติดตรงไหนให้หยุดแล้วถามเจ้าของก่อน อย่าเดา
      </p>

      <nav className="print:hidden bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <p className="text-xs font-medium text-gray-500 mb-2">หัวข้อ</p>
        <div className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-sm px-2.5 py-1 rounded-lg bg-[#FDF6EE] text-[#7A4E2D] hover:bg-[#F0E4D4]"
            >
              {i + 1}. {s.title}
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-5">
        {SECTIONS.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 scroll-mt-20"
          >
            <h2 className="flex items-center gap-2.5 text-lg font-semibold text-[#7A4E2D] mb-3 pb-2 border-b border-[#F0E4D4]">
              <span className="shrink-0 w-7 h-7 rounded-full bg-[#C4865A] text-white text-sm flex items-center justify-center">
                {i + 1}
              </span>
              {s.title}
            </h2>
            <Blocks blocks={s.blocks} />
          </section>
        ))}
      </div>
    </div>
  )
}
