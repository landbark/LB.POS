import guide from './guide.json'

// ต้นฉบับเดียวของคู่มือ = guide.json — หน้า /admin/help กับไฟล์ PDF ใน docs/ อ่านจากไฟล์เดียวกัน
// แก้เนื้อหาที่ guide.json แล้วรัน `node scripts/build-guide.mjs` เพื่อสร้าง PDF ใหม่
export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'steps'; items: string[] }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'note' | 'warn'; title: string; lines: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }

export interface Section {
  id: string
  title: string
  blocks: Block[]
}

export const SECTIONS = guide.sections as Section[]
export const UPDATED = guide.updated
