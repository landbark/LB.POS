// ร่างใบนับหน้าปิดกะ — เก็บในเบราว์เซอร์เครื่องนั้น ผูกกับกะที่เปิดอยู่
//
// พนักงานนับเงินค้างไว้ มีลูกค้ามาเลยสลับไปหน้าขาย กลับมาใบนับหายต้องนับใหม่ (25 พ.ย. 69)
// ร่างเป็นของกะเดียว ปิดกะแล้วหรือเป็นกะอื่นถือว่าไม่มีร่าง

const KEY = 'landbark-shift-draft'

export interface ShiftDraft {
  shiftId: string
  savedAt: string
  counts: Record<number, string>
  transfers: Record<string, string>
  keepEdit: string | null
  notes: string
  /** เงินสดที่ควรมีตอนเริ่มนับ — กลับมาแล้วยอดนี้ขยับ = มีเงินเข้าออกหลังนับ */
  baseCash: number | null
  /** ยอดโอน/QR ในระบบตอนเริ่มกรอกยอดบัญชี */
  baseBank: number | null
}

const filled = (o: Record<string, string>) => Object.values(o).some((v) => v.trim() !== '')

export function loadShiftDraft(shiftId: string): ShiftDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ShiftDraft | null
    return d && d.shiftId === shiftId ? d : null
  } catch {
    return null
  }
}

/** บันทึกร่าง · ไม่มีอะไรกรอกไว้เลย = ลบร่างทิ้ง (ปิดกะแล้วหน้าจอล้างช่องเอง ร่างหายตาม) */
export function saveShiftDraft(d: Omit<ShiftDraft, 'savedAt'>) {
  try {
    if (!filled(d.counts) && !filled(d.transfers) && d.keepEdit == null && !d.notes.trim()) {
      // ลบเฉพาะร่างของกะตัวเอง — อีกแท็บที่ยังค้างกะเก่าต้องไม่ลบร่างของกะใหม่
      if (loadShiftDraft(d.shiftId)) localStorage.removeItem(KEY)
      return
    }
    // แค่เปิดหน้ากลับมาดู ไม่ใช่การกรอก — เวลาร่างต้องเป็นเวลาที่กรอกจริงครั้งล่าสุด
    const old = loadShiftDraft(d.shiftId)
    if (old && JSON.stringify({ ...old, savedAt: '' }) === JSON.stringify({ ...d, savedAt: '' })) return
    localStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: new Date().toISOString() }))
  } catch {
    // เบราว์เซอร์ปิด storage ไว้ — ไม่มีร่าง แต่ปิดกะได้ตามปกติ
  }
}
