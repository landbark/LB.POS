'use client'

import { useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'

/**
 * ช่องกรอกวันที่แบบ วัน/เดือน/ปี
 *
 * `<input type="date">` เรียงช่องตาม locale ของเบราว์เซอร์ ไม่ใช่ของหน้าเว็บ — เครื่องที่ตั้งเป็น
 * en-US จะขึ้นเป็น เดือน/วัน/ปี แล้วบังคับไม่ได้เลยด้วย HTML/CSS (lang="th" ก็ไม่ช่วย) พนักงานที่
 * อ่านวันหมดอายุจากกล่องเป็น วว/ดด/ปปปป จึงกรอกสลับกันทั้งวัน — เลยกรอกเป็น text เองซะ
 * แล้วเก็บ/คืนค่าเป็น 'YYYY-MM-DD' เหมือน input date ทุกอย่าง
 *
 * ปุ่มปฏิทินยังเปิดตัวเลือกของเครื่องให้อยู่ (ผ่าน input date ที่ซ่อนไว้) ไว้ใช้ตอนไม่อยากพิมพ์
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' ('' ถ้าไม่ใช่วันที่) */
function toText(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/**
 * 'DD/MM/YYYY' → 'YYYY-MM-DD' (null = ยังกรอกไม่ครบ หรือไม่มีวันนั้นจริง)
 * ปีเกิน 2400 ถือว่าพิมพ์เป็น พ.ศ. มา — คนไทยอ่านวันหมดอายุจากกล่องยาเป็น พ.ศ. กันครึ่งต่อครึ่ง
 */
function toIso(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3]) > 2400 ? Number(m[3]) - 543 : Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year}-${pad(month)}-${pad(day)}`
  // กัน 31/02 ที่ผ่านด่านบนมาได้
  const check = new Date(`${iso}T00:00:00Z`)
  if (isNaN(check.getTime()) || check.getUTCDate() !== day) return null
  return iso
}

interface Props {
  /** 'YYYY-MM-DD' หรือ '' */
  value: string
  /** คืนเป็น 'YYYY-MM-DD' หรือ '' เมื่อล้างช่อง — ยังกรอกไม่ครบจะยังไม่เรียก */
  onChange: (iso: string) => void
  /** class ของช่องกรอก (ส่ง inputClass ของหน้านั้นมาได้เลย) */
  className?: string
  /** class ของกล่องครอบ — ใส่ flex-1 / w-full ตามที่ layout รอบๆ ต้องการ */
  wrapClass?: string
  id?: string
  disabled?: boolean
  autoFocus?: boolean
  'aria-label'?: string
}

export default function DateField({
  value,
  onChange,
  className = '',
  wrapClass = 'relative',
  id,
  disabled,
  autoFocus,
  'aria-label': ariaLabel,
}: Props) {
  const [text, setText] = useState(() => toText(value))
  const nativeRef = useRef<HTMLInputElement>(null)
  // ค่าล่าสุดที่เราส่งออกไป — ไว้แยกว่า value ที่เปลี่ยนมาจากข้างนอก (ฟอร์มรีเซ็ต) หรือจากเราเอง
  // ถ้าไม่แยก ระหว่างพิมพ์ค้างครึ่งทาง ('15/0') จะโดน value เดิมเขียนทับทุกตัวอักษร
  const [emitted, setEmitted] = useState(value)

  if (value !== emitted) {
    setEmitted(value)
    const fromOutside = toText(value)
    if (fromOutside !== text) setText(fromOutside)
  }

  function emit(iso: string) {
    setEmitted(iso)
    onChange(iso)
  }

  function type(raw: string) {
    // วางค่าที่ copy มาจากที่อื่นเป็น 2026-03-15 ก็รับ
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
      setText(toText(raw.trim()))
      emit(raw.trim())
      return
    }

    const deleting = raw.length < text.length
    let next = raw.replace(/[^\d/]/g, '').replace(/\/{2,}/g, '/').slice(0, 10)
    // เติม / ให้เองพอวัน/เดือนครบสองหลัก — พิมพ์ 15032026 รวดเดียวก็ได้ จะใส่ / เองก็ได้
    // (ตอนลบไม่เติม ไม่งั้นลบ '15/' แล้วมันงอกกลับมาทันที)
    if (!deleting && (/^\d{2}$/.test(next) || /^\d{1,2}\/\d{2}$/.test(next))) next += '/'

    setText(next)
    const iso = toIso(next)
    if (iso) emit(iso)
    else if (next === '') emit('')
  }

  function handleBlur() {
    // กรอกค้างไว้ครึ่งทางแล้วคลิกออก — ดีดกลับไปค่าที่ใช้ได้ล่าสุด จะได้ไม่เผลอคิดว่าบันทึกไปแล้ว
    if (text !== '' && !toIso(text)) setText(toText(value))
  }

  function openPicker() {
    const el = nativeRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
        return
      } catch {
        /* บางเบราว์เซอร์โยนเมื่อไม่ได้มาจากการกดของผู้ใช้ — ตกไปใช้ click ข้างล่าง */
      }
    }
    el.focus()
    el.click()
  }

  return (
    <div className={wrapClass}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        // ความกว้างพอดี 'วว/ดด/ปปปป' ตอนที่ class ไม่ได้กำหนดความกว้างมาเอง (เช่นในช่องตาราง)
        size={10}
        value={text}
        onChange={(e) => type(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder="วว/ดด/ปปปป"
        aria-label={ariaLabel}
        className={`${className} pr-8`}
      />
      {/* ต้องอยู่ใน layout จริง showPicker() ถึงเปิดได้ — ซ่อนด้วย opacity ไม่ใช่ display:none */}
      <input
        ref={nativeRef}
        type="date"
        value={value}
        onChange={(e) => {
          setText(toText(e.target.value))
          emit(e.target.value)
        }}
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        className="pointer-events-none absolute bottom-0 right-2 h-0 w-0 opacity-0"
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        tabIndex={-1}
        aria-label="เลือกจากปฏิทิน"
        title="เลือกจากปฏิทิน"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"
      >
        <CalendarDays size={15} />
      </button>
    </div>
  )
}
