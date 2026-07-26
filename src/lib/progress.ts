// ตัวส่งสัญญาณให้แถบโหลดด้านบน (TopLoader) เริ่ม/จบ ผ่าน window event
// ใช้ event เพื่อไม่ต้องผูก state ข้ามคอมโพเนนต์ — เรียกได้จากที่ไหนก็ได้ฝั่ง client
export function startProgress() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('lb:progress-start'))
}

export function doneProgress() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('lb:progress-done'))
}
