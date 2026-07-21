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

// map ชื่อหัวคอลัมน์ → index (ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่าง)
export function headerIndexer(header: string[]) {
  const normalized = header.map((h) => h.trim().toLowerCase().replace(/^﻿/, ''))
  return (name: string) => normalized.indexOf(name.toLowerCase())
}
