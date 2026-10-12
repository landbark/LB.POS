// อ่าน/แก้ไฟล์ .xlsx ตรงๆ ด้วย jszip + DOMParser — ไม่ต้องลงไลบรารี spreadsheet เพิ่ม
//
// ใช้กับเทมเพลต Mass Update ของ Shopee: เราเติมค่าลงเฉพาะ cell ที่ต้องการ แล้วเขียนไฟล์เดิมกลับ
// ตั้งใจไม่สร้างไฟล์ขึ้นใหม่ เพราะไฟล์ของ Shopee มีแถวหัว/metadata (รหัสเทมเพลต, เงื่อนไขการค้นหา)
// ที่ฝั่ง Shopee ใช้ตรวจตอนอัปโหลด — เลียนแบบเองไม่ได้ ต้องรักษาของเดิมไว้ทั้งก้อน

import JSZip from 'jszip'

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// 0 → 'A', 25 → 'Z', 26 → 'AA'
export function colLetter(index: number) {
  let s = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  }
  return s
}

// 'C7' → 2 (คอลัมน์ C), รูปแบบที่อ่านไม่ออก → -1
export function colIndexOf(ref: string) {
  const letters = /^([A-Z]+)/.exec(ref)?.[1]
  if (!letters) return -1
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('ไฟล์ .xlsx นี้อ่านไม่ออก')
  return doc
}

function els(parent: Element | Document, tag: string) {
  return Array.from(parent.getElementsByTagName(tag))
}

// ชีตแรกตามลำดับใน workbook (ไม่ใช่ตามชื่อไฟล์ ซึ่งเรียงไม่ตรงกันได้)
async function firstSheetPath(zip: JSZip) {
  const workbook = await zip.file('xl/workbook.xml')?.async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (workbook && rels) {
    const rid = els(parseXml(workbook), 'sheet')[0]?.getAttribute('r:id')
    const rel = els(parseXml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid)
    const target = rel?.getAttribute('Target')
    if (target) return `xl/${target.replace(/^\/?(xl\/)?/, '')}`
  }
  return Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d*\.xml$/.test(n))
    .sort()[0]
}

async function readSharedStrings(zip: JSZip) {
  const xml = await zip.file('xl/sharedStrings.xml')?.async('string')
  if (!xml) return []
  return els(parseXml(xml), 'si').map((si) =>
    els(si, 't')
      .map((t) => t.textContent ?? '')
      .join(''),
  )
}

function cellText(c: Element, shared: string[]) {
  const t = c.getAttribute('t')
  if (t === 'inlineStr') {
    return els(c, 't')
      .map((e) => e.textContent ?? '')
      .join('')
  }
  const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
  return t === 's' ? (shared[Number(v)] ?? '') : v
}

export interface XlsxDoc {
  /** ค่าทุกช่องเป็นข้อความ — rows[0] = แถวที่ 1 ในไฟล์, แถว/ช่องที่ว่างเป็น '' */
  rows: string[][]
  /** เขียนตัวเลขลงช่อง (index เริ่มที่ 0 ทั้งแถวและคอลัมน์) ทับค่า/สูตรเดิม */
  setNumber(row: number, col: number, value: number): void
  toBlob(): Promise<Blob>
}

export async function openXlsx(file: Blob): Promise<XlsxDoc> {
  const zip = await JSZip.loadAsync(file)
  const path = await firstSheetPath(zip)
  if (!path) throw new Error('ไม่พบชีตข้อมูลในไฟล์ .xlsx นี้')

  const shared = await readSharedStrings(zip)
  const doc = parseXml(await zip.file(path)!.async('string'))
  const sheetData = doc.getElementsByTagName('sheetData')[0]
  if (!sheetData) throw new Error('ไม่พบข้อมูลในชีตแรกของไฟล์')

  const rowEls = new Map<number, Element>()
  const rows: string[][] = []
  for (const rowEl of els(sheetData, 'row')) {
    const n = Number(rowEl.getAttribute('r'))
    if (!n) continue
    rowEls.set(n, rowEl)
    const cells: string[] = []
    for (const c of els(rowEl, 'c')) {
      const i = colIndexOf(c.getAttribute('r') ?? '')
      if (i < 0) continue
      while (cells.length < i) cells.push('')
      cells[i] = cellText(c, shared)
    }
    while (rows.length < n - 1) rows.push([])
    rows[n - 1] = cells
  }

  function rowElement(rowNum: number) {
    const existing = rowEls.get(rowNum)
    if (existing) return existing
    const rowEl = doc.createElementNS(NS, 'row')
    rowEl.setAttribute('r', String(rowNum))
    const after = els(sheetData!, 'row').find((r) => Number(r.getAttribute('r')) > rowNum)
    sheetData!.insertBefore(rowEl, after ?? null)
    rowEls.set(rowNum, rowEl)
    return rowEl
  }

  function cellElement(rowEl: Element, col: number, ref: string) {
    const existing = els(rowEl, 'c').find((c) => c.getAttribute('r') === ref)
    if (existing) return existing
    const cell = doc.createElementNS(NS, 'c')
    cell.setAttribute('r', ref)
    const after = els(rowEl, 'c').find((c) => colIndexOf(c.getAttribute('r') ?? '') > col)
    rowEl.insertBefore(cell, after ?? null)
    return cell
  }

  return {
    rows,
    setNumber(row, col, value) {
      const cell = cellElement(rowElement(row + 1), col, colLetter(col) + (row + 1))
      cell.removeAttribute('t') // ไม่มี t = ตัวเลข (เดิมอาจเป็น t="s" ข้อความ)
      while (cell.firstChild) cell.removeChild(cell.firstChild) // ทิ้งค่าเดิมและสูตรเดิม
      const v = doc.createElementNS(NS, 'v')
      v.textContent = String(value)
      cell.appendChild(v)

      const cells = rows[row] ?? (rows[row] = [])
      while (cells.length < col) cells.push('')
      cells[col] = String(value)
    },
    async toBlob() {
      // createFolders: false — ไม่ให้ jszip แถม entry โฟลเดอร์ที่ไฟล์เดิมไม่มี ไฟล์ที่ออกไปจะมีชิ้นส่วนเท่าของ Shopee เป๊ะ
      zip.file(path!, new XMLSerializer().serializeToString(doc), { createFolders: false })
      return zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' })
    },
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
