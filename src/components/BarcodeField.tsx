'use client'

import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import BarcodeScanner, { type ScanFeedback } from './BarcodeScanner'

interface Props {
  value: string
  onChange: (code: string) => void
  /** คลาสของช่องกรอก — ส่งของหน้านั้นมา ช่องนี้จะได้หน้าตาเหมือนช่องอื่นในฟอร์ม */
  className: string
  placeholder?: string
  /** หัวข้อบนกล้อง — บอกว่ากำลังตั้งบาร์โค้ดให้อะไร (ตัวสินค้า/ลัง) */
  title?: string
}

/**
 * ช่องบาร์โค้ดที่ยิงใส่ได้ — ไม่ต้องเพ่งอ่านเลขสิบสามหลักข้างกล่องแล้วพิมพ์เอง
 *
 * ยิงติดแล้วปิดกล้องทันที ต่างจากหน้าขาย/หน้านับที่ยิงรัวได้ เพราะช่องนี้เก็บได้ค่าเดียว
 * (ยิงผิดตัวก็กดยิงใหม่ทับได้เลย)
 */
export default function BarcodeField({ value, onChange, className, placeholder, title }: Props) {
  const [scanning, setScanning] = useState(false)

  function handleDetect(code: string): ScanFeedback {
    onChange(code.trim())
    setScanning(false)
    return { ok: true, message: code }
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} min-w-0 flex-1`}
        placeholder={placeholder}
      />
      {/* type=button — ไม่งั้นกดแล้วฟอร์มส่งข้อมูลทันทีทั้งที่ยังกรอกไม่เสร็จ */}
      <button
        type="button"
        onClick={() => setScanning(true)}
        title="ยิงบาร์โค้ด"
        aria-label="ยิงบาร์โค้ด"
        className="flex shrink-0 items-center justify-center rounded-lg border border-gray-300 px-3 text-gray-700 hover:bg-gray-50"
      >
        <ScanLine size={18} />
      </button>
      {scanning && (
        <BarcodeScanner
          onDetect={handleDetect}
          onClose={() => setScanning(false)}
          title={title ?? 'ยิงบาร์โค้ด'}
          hint="จ่อบาร์โค้ดให้อยู่ในกรอบ — ยิงติดแล้วจะปิดกล้องแล้วใส่เลขลงช่องให้เอง"
        />
      )}
    </div>
  )
}
