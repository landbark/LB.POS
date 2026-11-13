import { AlertTriangle, StickyNote } from 'lucide-react'
import { hasPetWarning, petWarnings, type PetAlertFields } from '@/lib/pets'

/**
 * แถบเตือนของสัตว์หนึ่งตัว — ใช้ซ้ำทุกจุดที่เจอสัตว์ (ค้นหา / ลงทะเบียน / ตรวจรักษา)
 *
 * รวมไว้ที่เดียวเพราะเดิมแต่ละหน้าเขียนเงื่อนไข (allergies || chronic_conditions) เอง
 * แล้วพอเพิ่มช่อง "ข้อควรระวัง" ขึ้นมา บางหน้าก็จะลืมเตือน — ซึ่งเป็นหน้าที่คนอ่าน
 * ก่อนจะเอามือเข้าไปจับตัวสัตว์
 *
 * ข้อควรระวัง/แพ้ยา/โรคประจำตัว = สีส้มตะโกน, หมายเหตุ = เทาเงียบ ๆ
 * (หมายเหตุเป็นบันทึกทั่วไป ถ้าทำให้ตะโกนเท่ากันหมด คนจะเลิกอ่านทั้งแถบ)
 */
export default function PetAlert({
  pet,
  showNotes = true,
  className = '',
}: {
  pet: PetAlertFields
  /** ปิดได้ในจุดที่แคบ ๆ เช่น รายการผลค้นหา */
  showNotes?: boolean
  className?: string
}) {
  const warnings = petWarnings(pet)
  const notes = showNotes ? pet.notes?.trim() : null
  if (warnings.length === 0 && !notes) return null

  return (
    <div className={`space-y-1.5 ${className}`}>
      {warnings.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{warnings.join(' · ')}</p>
        </div>
      )}
      {notes && (
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <StickyNote size={15} className="text-gray-400 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600">{notes}</p>
        </div>
      )}
    </div>
  )
}

/** แบบย่อสำหรับช่องแคบ ๆ (ช่องในตาราง / การ์ดสัตว์ / รายการผลค้นหา) */
export function PetAlertChip({
  pet,
  className = '',
}: {
  pet: PetAlertFields
  className?: string
}) {
  if (!hasPetWarning(pet)) return null
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full ${className}`}
    >
      <AlertTriangle size={11} className="shrink-0" />
      {petWarnings(pet).join(' · ')}
    </span>
  )
}
