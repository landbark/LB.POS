'use client'

// กล่องยืนยันของแอปเอง (แทน window.confirm / window.prompt ของเบราว์เซอร์
// ที่เด้งชิดขอบบนจอ กดยาก และหน้าตาไม่เข้ากับระบบ)
//
// ใช้แบบเดียวกับ confirm() เดิม:
//   if (!(await confirmDialog({ message: 'ลบเลยไหม?' })).confirmed) return
// อยากได้เหตุผลด้วยก็ใส่ reasonLabel:
//   const { confirmed, value } = await confirmDialog({ ..., reasonLabel: 'เหตุผล' })

export interface ConfirmOptions {
  title?: string
  message: string
  /** ข้อความปุ่มยืนยัน */
  confirmLabel?: string
  cancelLabel?: string
  /** danger = ปุ่มแดง (ลบ/ยกเลิก), primary = ปุ่มน้ำเงิน */
  tone?: 'danger' | 'primary'
  /** ใส่แล้วจะมีช่องกรอกข้อความ (แทน prompt) */
  reasonLabel?: string
  reasonPlaceholder?: string
  /** บังคับกรอกช่องเหตุผลไหม */
  reasonRequired?: boolean
}

export interface ConfirmResult {
  confirmed: boolean
  value: string
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (result: ConfirmResult) => void
}

type Listener = (request: ConfirmRequest) => void

let listener: Listener | null = null

/** ให้ ConfirmHost ลงทะเบียนตัวรับคำขอ (มีได้ตัวเดียว วางไว้ใน root layout) */
export function registerConfirmHost(next: Listener | null) {
  listener = next
}

export function confirmDialog(options: ConfirmOptions): Promise<ConfirmResult> {
  // ไม่มี host (เช่นถูกเรียกก่อน mount) — ถอยไปใช้ของเบราว์เซอร์ ดีกว่าค้างไปเฉยๆ
  if (!listener) {
    const ok = typeof window !== 'undefined' && window.confirm(options.message)
    return Promise.resolve({ confirmed: ok, value: '' })
  }
  return new Promise((resolve) => listener!({ ...options, resolve }))
}
