// ตัวช่วยอ่าน/สร้างไฟล์ CSV ใช้ร่วมกันระหว่างการนำเข้าสินค้าและซัพพลายเออร์

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c === '\r') {
      // skip, \n handles the row push
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

export function csvField(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// ดาวน์โหลด template — ใส่ BOM ไว้ให้ Excel อ่านภาษาไทยไม่เพี้ยน
export function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map(csvField).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// แปลงวันที่จากช่อง CSV → 'YYYY-MM-DD' (null = ว่าง, undefined = รูปแบบผิด)
// รองรับ 2026-07-22, 22/07/2026, 22-07-2026 และปี พ.ศ. (แปลงให้อัตโนมัติ)
export function parseDateCell(v: string): string | null | undefined {
  const s = v.trim()
  if (!s) return null

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (!iso && !dmy) return undefined

  let y = Number(iso ? iso[1] : dmy![3])
  const m = Number(iso ? iso[2] : dmy![2])
  const d = Number(iso ? iso[3] : dmy![1])

  if (y > 2400) y -= 543 // พ.ศ. → ค.ศ.
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined
  const pad = (n: number) => String(n).padStart(2, '0')
  const out = `${y}-${pad(m)}-${pad(d)}`
  // เช็คว่าเป็นวันที่ที่มีอยู่จริง (กัน 31/02)
  const parsed = new Date(`${out}T00:00:00Z`)
  if (isNaN(parsed.getTime()) || parsed.getUTCDate() !== d) return undefined
  return out
}

// map ชื่อหัวคอลัมน์ → index (ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่าง)
export function headerIndexer(header: string[]) {
  const normalized = header.map((h) => h.trim().toLowerCase().replace(/^﻿/, ''))
  return (name: string) => normalized.indexOf(name.toLowerCase())
}
