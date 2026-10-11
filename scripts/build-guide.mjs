// สร้างคู่มือพนักงานเป็น HTML + PDF จาก src/app/admin/help/guide.json (ต้นฉบับเดียวกับหน้า /admin/help)
// ใช้: node scripts/build-guide.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const guide = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/app/admin/help/guide.json'), 'utf8'))
const OUT_HTML = path.join(ROOT, 'docs/cashier-guide.html')
const OUT_PDF = path.join(ROOT, 'docs/คู่มือแคชเชียร์-LANDBARK-POS.pdf')

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const thaiDate = (iso) =>
  new Date(`${iso}T00:00:00+07:00`).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok',
  })

function renderBlock(b) {
  switch (b.kind) {
    case 'p': return `<p>${esc(b.text)}</p>`
    case 'h': return `<h3>${esc(b.text)}</h3>`
    case 'steps': return `<ol>${b.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`
    case 'bullets': return `<ul>${b.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    case 'note':
    case 'warn':
      return `<div class="box${b.kind === 'warn' ? ' warn' : ''}"><span class="t">${esc(b.title)}</span>${
        b.lines.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`
    case 'table':
      return `<table><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
        b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    default: throw new Error('ไม่รู้จัก block ชนิด ' + b.kind)
  }
}

const body = guide.sections.map((s, i) =>
  `<h2><span class="n">${i + 1}</span>${esc(s.title)}</h2>\n${s.blocks.map(renderBlock).join('\n')}`
).join('\n\n')

// ฟอนต์ไทยใช้ของระบบ (Thonburi) — อย่าใส่ emoji ลงเนื้อหา headless Chrome เรนเดอร์เพี้ยน
const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>คู่มือแคชเชียร์ LANDBARK POS</title>
<style>
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { font-family: "Sarabun", "Thonburi", "Helvetica Neue", sans-serif; color: #2F2A24; font-size: 10.5pt; line-height: 1.6; margin: 0; }
  h1 { font-size: 20pt; color: #7A4E2D; margin: 0 0 2mm; }
  .sub { color: #8A7B6B; font-size: 9.5pt; margin: 0 0 7mm; }
  h2 { font-size: 12.5pt; color: #7A4E2D; margin: 7mm 0 2.5mm; padding-bottom: 1.5mm; border-bottom: 1.5pt solid #E8D5C0; break-after: avoid; }
  h2 .n { display: inline-block; width: 7mm; height: 7mm; line-height: 7mm; text-align: center; border-radius: 50%; background: #C4865A; color: #fff; font-size: 9pt; margin-right: 2.5mm; vertical-align: 1px; }
  h3 { font-size: 10.5pt; margin: 4mm 0 1mm; color: #5A4A3A; break-after: avoid; }
  p, li { margin: 0 0 1.8mm; }
  ol, ul { margin: 0 0 2.5mm; padding-left: 6mm; }
  li { padding-left: 1mm; }
  .box { background: #FDF6EE; border-left: 2.5pt solid #C4865A; padding: 2.5mm 3.5mm; margin: 2.5mm 0 3mm; break-inside: avoid; }
  .box.warn { background: #FDF0EC; border-left-color: #C25A3C; }
  .box p:last-child { margin-bottom: 0; }
  .box .t { font-weight: 700; color: #7A4E2D; display: block; margin-bottom: 0.8mm; }
  .box.warn .t { color: #A8402A; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 3mm; font-size: 9.5pt; break-inside: avoid; }
  th { background: #F0E4D4; color: #6B4A2E; text-align: left; font-weight: 700; }
  th, td { border: 0.5pt solid #E0D0BC; padding: 1.6mm 2.5mm; vertical-align: top; }
  tbody tr:nth-child(even) { background: #FDFAF6; }
  footer { margin-top: 8mm; padding-top: 2.5mm; border-top: 0.5pt solid #E0D0BC; color: #9A8B7B; font-size: 8.5pt; }
  .lead { background: #F6EFE6; padding: 3mm 4mm; border-radius: 2mm; margin-bottom: 5mm; }
  .lead p { margin: 0; }
</style>
</head>
<body>
<h1>คู่มือแคชเชียร์ LANDBARK POS</h1>
<p class="sub">ฉบับวันที่ ${thaiDate(guide.updated)} · สำหรับพนักงานหน้าร้าน</p>
<div class="lead"><p>คู่มือนี้เรียงตามลำดับงานจริงของวัน ตั้งแต่เปิดร้านจนปิดร้าน ทำตามทีละข้อได้เลย ถ้าติดตรงไหนให้หยุดแล้วถามเจ้าของก่อน อย่าเดา</p></div>

${body}

<footer>LANDBARK POS · คู่มือแคชเชียร์ · ปรับปรุง ${thaiDate(guide.updated)} — ฉบับเดียวกับหน้า "คู่มือพนักงาน" ในระบบ</footer>
</body>
</html>`

fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true })
fs.writeFileSync(OUT_HTML, html)
console.log('เขียน', path.relative(ROOT, OUT_HTML))

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (fs.existsSync(CHROME)) {
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${OUT_PDF}`, `file://${OUT_HTML}`], { stdio: 'ignore' })
  console.log('เขียน', path.relative(ROOT, OUT_PDF))
} else {
  console.log('ไม่เจอ Google Chrome — ข้ามการสร้าง PDF')
}
