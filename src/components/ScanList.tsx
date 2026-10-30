'use client'

import { useState } from 'react'
import { Minus, Plus, Trash2, Delete } from 'lucide-react'

export interface ScanListRow {
  /** คีย์ของแถว — ส่งกลับมาทาง onSetQty / onRemove */
  key: string
  name: string
  /** บรรทัดเล็กใต้ชื่อ — หน่วย/ราคา/lot */
  sub?: string | null
  qty: number
  /** หน่วยที่ต่อท้ายจำนวนบนแป้นตัวเลข */
  unit?: string | null
}

interface Props {
  /** เรียงใหม่สุดไว้บนสุด — ตัวที่เพิ่งยิงต้องอยู่ติดใต้กล้อง ไม่ต้องเลื่อนหา */
  rows: ScanListRow[]
  /** ข้อความตอนยังไม่ได้ยิงอะไร */
  empty: string
  onSetQty: (key: string, qty: number) => void
  onRemove: (key: string) => void
  /** แถวที่เพิ่งยิงเข้ามา — ไฮไลต์ให้เห็นว่าเลขไหนเพิ่งขยับ */
  activeKey?: string | null
}

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * รายการที่ยิงมาแล้ว โชว์ใต้กล้องในหน้าสแกน — แก้จำนวนได้เลยไม่ต้องปิดกล้อง
 *
 * ทุกปุ่มเป็นปุ่มกด ไม่มี input ตัวหนังสือเลยแม้แต่ช่องเดียว เพราะคีย์บอร์ดของเครื่อง
 * จะเด้งขึ้นมาบังรายการ (และบางเครื่องดันกล้องหลุดจอไปด้วย) — จะพิมพ์เลขก็ใช้แป้นของแอป
 * ที่ทับเฉพาะส่วนรายการ กล้องยังเห็นอยู่
 */
export default function ScanList({ rows, empty, onSetQty, onRemove, activeKey }: Props) {
  // แถวที่กำลังเปิดแป้นตัวเลข + เลขที่กดค้างไว้ ('' = ยังไม่กด โชว์ของเดิมเป็นเงา)
  const [pad, setPad] = useState<{ key: string; text: string } | null>(null)
  const padRow = pad ? rows.find((r) => r.key === pad.key) : null

  function commitPad() {
    if (!pad || !padRow) return setPad(null)
    const n = parseInt(pad.text || '0', 10)
    if (pad.text && n > 0) onSetQty(pad.key, n)
    else if (pad.text) onRemove(pad.key)
    setPad(null)
  }

  return (
    <div className="relative min-h-0 flex-1 bg-white">
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="h-full divide-y divide-gray-100 overflow-y-auto overscroll-contain">
          {rows.map((row) => (
            <li
              key={row.key}
              className={`flex items-center gap-2 px-3 py-2 ${row.key === activeKey ? 'bg-amber-50' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{row.name}</p>
                {row.sub && <p className="truncate text-xs text-gray-500">{row.sub}</p>}
              </div>
              <button
                onClick={() => (row.qty <= 1 ? onRemove(row.key) : onSetQty(row.key, row.qty - 1))}
                aria-label="ลดจำนวน"
                className="shrink-0 rounded-lg bg-gray-100 p-2 text-gray-700 active:bg-gray-200"
              >
                <Minus size={18} />
              </button>
              {/* กดตัวเลขเพื่อพิมพ์ยอดตรงๆ — ของจริงหลายชิ้นไม่ต้องกดบวกรัว */}
              <button
                onClick={() => setPad({ key: row.key, text: '' })}
                className="min-w-11 shrink-0 rounded-lg border border-gray-200 px-2 py-1.5 text-center text-base font-semibold tabular-nums text-gray-900 active:bg-gray-100"
              >
                {row.qty}
              </button>
              <button
                onClick={() => onSetQty(row.key, row.qty + 1)}
                aria-label="เพิ่มจำนวน"
                className="shrink-0 rounded-lg bg-gray-100 p-2 text-gray-700 active:bg-gray-200"
              >
                <Plus size={18} />
              </button>
              <button
                onClick={() => onRemove(row.key)}
                aria-label="เอาออก"
                className="shrink-0 p-1.5 text-gray-300 active:text-red-500"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {padRow && pad && (
        <div className="absolute inset-0 flex flex-col bg-white">
          <div className="flex items-baseline gap-2 border-b border-gray-100 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{padRow.name}</span>
            <span className={`text-xl font-semibold tabular-nums ${pad.text ? 'text-gray-900' : 'text-gray-300'}`}>
              {pad.text || padRow.qty}
            </span>
            {padRow.unit && <span className="text-xs text-gray-500">{padRow.unit}</span>}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-3 gap-1 p-1">
            {PAD_KEYS.map((k) => (
              <button
                key={k}
                // ตัดที่ 4 หลัก — กดเพลินจนเป็นหมื่นแล้วเผลอบันทึกไปจะแก้ยาก
                onClick={() => setPad((p) => (p ? { ...p, text: (p.text + k).slice(0, 4) } : p))}
                className="rounded-lg bg-gray-100 text-lg font-semibold text-gray-900 active:bg-gray-200"
              >
                {k}
              </button>
            ))}
            <button
              onClick={() => setPad(null)}
              className="rounded-lg bg-gray-100 text-sm text-gray-600 active:bg-gray-200"
            >
              ยกเลิก
            </button>
            <button
              onClick={() => setPad((p) => (p ? { ...p, text: (p.text + '0').slice(0, 4) } : p))}
              className="rounded-lg bg-gray-100 text-lg font-semibold text-gray-900 active:bg-gray-200"
            >
              0
            </button>
            <button
              onClick={() => setPad((p) => (p ? { ...p, text: p.text.slice(0, -1) } : p))}
              aria-label="ลบตัวท้าย"
              className="flex items-center justify-center rounded-lg bg-gray-100 text-gray-700 active:bg-gray-200"
            >
              <Delete size={20} />
            </button>
          </div>
          <button
            onClick={commitPad}
            className="shrink-0 bg-blue-600 py-3 text-sm font-medium text-white active:bg-blue-700"
          >
            ตกลง
          </button>
        </div>
      )}
    </div>
  )
}
