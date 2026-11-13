// เอกสารคลินิกที่กรอก + เซฟติด HN — นิยามของทุกชนิดเอกสารอยู่ไฟล์นี้ที่เดียว
//
// ทำไมเป็น "นิยาม" ไม่ใช่หน้าละฟอร์ม: ใบยินยอมมีหลายใบและร้านขอเพิ่มเรื่อย ๆ
// ถ้าเขียนเป็นหน้า + ตารางต่อหนึ่งใบ ก็ต้องรัน migration ทุกครั้งที่เพิ่มใบใหม่
// แบบนี้เพิ่มชนิดใหม่ = เพิ่ม object ในไฟล์นี้ (ตัวกรอก/ตัวพิมพ์/ลิสต์ประวัติใช้ของเดิมหมด)
//
// ค่าทุกช่องเก็บเป็น JSONB ใน clinic_documents.data — คีย์คือ DocField.key

import { SPECIES_LABELS, type Pet, type PetVaccination, type Visit } from './types'
import { petAge } from './pets'
import { visitDiagnosisText, type DiagnosisLink } from './diagnoses'

/** แก้เอกสารได้กี่ชั่วโมงหลังออก — DB บังคับด้วย trigger เดียวกัน (ดู supabase-migration-clinic-documents.sql) */
export const DOC_EDIT_HOURS = 24

export type DocFieldType = 'text' | 'textarea' | 'date'

export interface DocField {
  key: string
  label: string
  type?: DocFieldType
  /** กว้างในฟอร์มกรอก: กริด 6 ช่อง (6 = เต็มบรรทัด) */
  span?: 1 | 2 | 3 | 4 | 6
  rows?: number
  /** หน่วยท้ายช่อง เช่น กก. / บาท */
  suffix?: string
  placeholder?: string
  /** ค่าตั้งต้นตอนเปิดฟอร์มใหม่ (ดึงจากทะเบียนสัตว์/ใบตรวจ) — แก้ทับได้ทั้งหมด */
  prefill?: (c: DocContext) => string
  /** ใบพิมพ์: ว่างแล้วยังขึ้นหัวข้อ + เส้นให้เขียนมือ (ใช้กับช่องที่ต้องเซ็น/เขียนหน้างาน) */
  keepBlank?: boolean
}

export interface DocSection {
  heading?: string
  fields: DocField[]
}

export interface DocTypeDef {
  type: string
  /** ชื่อบนหัวเอกสาร */
  title: string
  /** ชื่อรองภาษาอังกฤษ */
  subtitle?: string
  /** ชื่อปุ่ม/ลิสต์ (สั้นกว่า title) */
  short: string
  sections: DocSection[]
  /** ข้อความยินยอม/คำรับรอง พิมพ์ก่อนช่องลงนาม */
  body?: string[]
  /** ช่องลงนามท้ายเอกสาร */
  signatures: string[]
  /** ช่องที่เอามาต่อกันเป็นบรรทัดสรุปในลิสต์ประวัติ */
  summaryKeys: string[]
}

export interface DocHistoryEntry {
  visit_date: string
  diagnosis: string | null
  treatment?: string | null
  visit_diagnoses?: DiagnosisLink[] | null
}

/** ข้อมูลที่ใช้เติมค่าตั้งต้น — ประกอบฝั่ง server ตอนเปิดฟอร์มใหม่ */
export interface DocContext {
  pet: Pet
  owner: { name: string; phone: string | null; address: string | null } | null
  visit: Visit | null
  /** น้ำหนักล่าสุด (ใบตรวจนี้ก่อน ไม่มีค่อยย้อนใบก่อน) */
  weight: number | null
  /** ประวัติการรักษาย้อนหลัง เรียงใหม่→เก่า */
  history: DocHistoryEntry[]
  vaccinations: PetVaccination[]
  /** รายการยาที่จ่ายในใบตรวจนี้ พร้อมวิธีใช้ */
  meds: string[]
  vetName: string | null
}

const dateTh = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
export const todayTh = () => new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' })

const petInfo = (c: DocContext) => [
  SPECIES_LABELS[c.pet.species],
  c.pet.breed,
  c.pet.sex ? (c.pet.sex === 'male' ? 'เพศผู้' : 'เพศเมีย') : null,
  petAge(c.pet.birth_date),
].filter(Boolean).join(' · ')

const warningsText = (c: DocContext) => [
  c.pet.caution?.trim() && `ระวัง: ${c.pet.caution.trim()}`,
  c.pet.allergies?.trim() && `แพ้: ${c.pet.allergies.trim()}`,
  c.pet.chronic_conditions?.trim() && `โรคประจำตัว: ${c.pet.chronic_conditions.trim()}`,
].filter(Boolean).join(' · ')

const diagnosisText = (c: DocContext) =>
  c.visit ? [visitDiagnosisText(c.visit), c.visit.diagnosis?.trim()].filter(Boolean).join(' — ') : ''

const historyText = (c: DocContext) =>
  c.history
    .filter((v) => visitDiagnosisText(v) || v.treatment)
    .map((v) => `${dateTh(v.visit_date)} — ${[visitDiagnosisText(v), v.treatment].filter(Boolean).join(' / ')}`)
    .join('\n')

const vaccineText = (c: DocContext) =>
  c.vaccinations
    .slice(0, 8)
    .map((v) => `${v.vaccine_name} — ฉีด ${dateTh(v.dose_date)}${v.next_due_date ? ` (นัดถัดไป ${dateTh(v.next_due_date)})` : ''}`)
    .join('\n')

// ── ช่องที่ทุกใบใช้เหมือนกัน ────────────────────────────────────────────────
const dateField: DocField = {
  key: 'doc_date', label: 'วันที่', span: 2, prefill: () => todayTh(),
}

const petFields: DocField[] = [
  { key: 'hn', label: 'HN', span: 2, prefill: (c) => c.pet.hn ?? '' },
  { key: 'pet_name', label: 'ชื่อสัตว์', span: 2, prefill: (c) => c.pet.name },
  { key: 'weight', label: 'น้ำหนัก', span: 2, suffix: 'กก.', prefill: (c) => (c.weight != null ? String(c.weight) : '') },
  { key: 'pet_info', label: 'ชนิด / พันธุ์ / เพศ / อายุ', span: 4, prefill: petInfo },
  { key: 'pet_color', label: 'สี / ตำหนิ', span: 2, prefill: (c) => c.pet.color ?? '' },
]

const ownerFields: DocField[] = [
  { key: 'owner_name', label: 'เจ้าของ', span: 3, prefill: (c) => c.owner?.name ?? '' },
  { key: 'owner_phone', label: 'โทร', span: 3, prefill: (c) => c.owner?.phone ?? '' },
  { key: 'owner_address', label: 'ที่อยู่', span: 6, prefill: (c) => c.owner?.address ?? '' },
]

const petOwnerSection = (heading = 'ข้อมูลสัตว์และเจ้าของ'): DocSection => ({
  heading,
  fields: [dateField, ...petFields, ...ownerFields],
})

const estimateField: DocField = { key: 'estimate', label: 'ค่าใช้จ่ายโดยประมาณ', span: 3, suffix: 'บาท' }

// ── นิยามเอกสารแต่ละชนิด ────────────────────────────────────────────────────
export const DOC_TYPES: DocTypeDef[] = [
  {
    type: 'referral',
    short: 'ใบส่งตัว',
    title: 'ใบส่งตัวสัตว์ป่วย',
    subtitle: 'Referral / Transfer Form',
    summaryKeys: ['to_clinic', 'reason'],
    sections: [
      petOwnerSection(),
      {
        heading: 'ส่งตัวไปยัง',
        fields: [
          { key: 'to_clinic', label: 'คลินิก / โรงพยาบาลสัตว์', span: 4, placeholder: 'ชื่อสถานพยาบาลปลายทาง' },
          { key: 'to_vet', label: 'เรียน สัตวแพทย์', span: 2 },
        ],
      },
      {
        heading: 'ข้อมูลทางคลินิก',
        fields: [
          { key: 'chief_complaint', label: 'อาการสำคัญ / ข้อควรระวัง', type: 'textarea', rows: 2, span: 6, prefill: (c) => [warningsText(c), c.visit?.symptoms?.trim()].filter(Boolean).join('\n') },
          { key: 'diagnosis', label: 'การวินิจฉัยเบื้องต้น', type: 'textarea', rows: 2, span: 6, prefill: diagnosisText },
          { key: 'history', label: 'ประวัติการตรวจรักษาที่ให้ไปแล้ว', type: 'textarea', rows: 4, span: 6, prefill: historyText },
          { key: 'lab', label: 'ผลตรวจ / แล็บ / ภาพถ่ายรังสี', type: 'textarea', rows: 3, span: 6 },
          { key: 'meds', label: 'ยาที่ให้ไปแล้ว', type: 'textarea', rows: 3, span: 6, prefill: (c) => c.meds.join('\n') },
          { key: 'reason', label: 'เหตุผลการส่งตัว / สิ่งที่ต้องการให้ดำเนินการต่อ', type: 'textarea', rows: 3, span: 6 },
        ],
      },
    ],
    signatures: ['ลงชื่อสัตวแพทย์ผู้ส่งตัว'],
  },
  {
    type: 'consent_surgery',
    short: 'ใบยินยอมวางยา/ผ่าตัด',
    title: 'หนังสือแสดงความยินยอมให้วางยาสลบและผ่าตัด',
    subtitle: 'Consent for Anesthesia and Surgery',
    summaryKeys: ['procedure', 'diagnosis'],
    sections: [
      petOwnerSection(),
      {
        heading: 'หัตถการ',
        fields: [
          { key: 'diagnosis', label: 'การวินิจฉัย', type: 'textarea', rows: 2, span: 6, prefill: diagnosisText },
          { key: 'procedure', label: 'หัตถการ / การผ่าตัดที่จะดำเนินการ', type: 'textarea', rows: 2, span: 6 },
          { key: 'anesthesia', label: 'วิธีวางยา / ยาที่ใช้', span: 3 },
          { key: 'fasting', label: 'งดน้ำ-งดอาหารตั้งแต่', span: 3 },
          estimateField,
          { key: 'emergency', label: 'กรณีฉุกเฉินระหว่างหัตถการ', span: 3, placeholder: 'เช่น ยินยอมให้ช่วยชีวิต / ไม่ประสงค์ให้ยื้อ' },
          { key: 'risk_note', label: 'ความเสี่ยงเฉพาะรายที่อธิบายเพิ่ม', type: 'textarea', rows: 2, span: 6, prefill: warningsText },
        ],
      },
    ],
    body: [
      'ข้าพเจ้ารับทราบและเข้าใจว่า การวางยาสลบและการผ่าตัดมีความเสี่ยงที่อาจเกิดขึ้นได้ แม้จะได้ดำเนินการด้วยความระมัดระวังตามมาตรฐานวิชาชีพแล้วก็ตาม ความเสี่ยงดังกล่าวรวมถึงแต่ไม่จำกัดเพียง อาการแพ้ยา ภาวะแทรกซ้อนจากการวางยาสลบ ภาวะช็อก หรือการเสียชีวิต ซึ่งอาจเกิดจากสภาพร่างกายของสัตว์ที่ไม่อาจคาดการณ์ได้ล่วงหน้า',
      'ข้าพเจ้ายินยอมให้สัตวแพทย์ทำการตรวจ วางยาสลบ ผ่าตัด และให้การรักษาตามที่เห็นสมควรทางวิชาชีพ รวมถึงการดำเนินการเพิ่มเติมที่จำเป็นในระหว่างการผ่าตัดเพื่อประโยชน์สูงสุดของสัตว์ และในกรณีฉุกเฉิน ข้าพเจ้ายินยอมให้สัตวแพทย์ช่วยชีวิตตามความเหมาะสม',
      'ข้าพเจ้าได้รับคำอธิบายเกี่ยวกับหัตถการ ความเสี่ยง และค่าใช้จ่ายโดยประมาณเป็นที่เข้าใจแล้ว จึงลงลายมือชื่อไว้เป็นหลักฐาน',
    ],
    signatures: ['ลงชื่อเจ้าของ / ผู้มีอำนาจตัดสินใจ', 'ลงชื่อสัตวแพทย์ผู้ทำหัตถการ', 'ลงชื่อพยาน', 'วันที่'],
  },
  {
    type: 'consent_treatment',
    short: 'ใบยินยอมรับการรักษา',
    title: 'หนังสือแสดงความยินยอมรับการตรวจรักษาและทำหัตถการ',
    subtitle: 'Consent for Treatment and Procedure',
    summaryKeys: ['procedure', 'diagnosis'],
    sections: [
      petOwnerSection(),
      {
        heading: 'การรักษา',
        fields: [
          { key: 'diagnosis', label: 'การวินิจฉัย / อาการ', type: 'textarea', rows: 2, span: 6, prefill: diagnosisText },
          { key: 'procedure', label: 'การรักษา / หัตถการที่จะทำ', type: 'textarea', rows: 3, span: 6 },
          { key: 'risks', label: 'ความเสี่ยง / ผลข้างเคียงที่อธิบายแล้ว', type: 'textarea', rows: 2, span: 6 },
          { key: 'alternatives', label: 'ทางเลือกอื่นที่ได้อธิบาย', type: 'textarea', rows: 2, span: 6 },
          estimateField,
          { key: 'note', label: 'ข้อตกลงเพิ่มเติม', span: 3 },
        ],
      },
    ],
    body: [
      'ข้าพเจ้าได้รับคำอธิบายจากสัตวแพทย์เกี่ยวกับอาการของสัตว์ แนวทางการรักษา ความเสี่ยงที่อาจเกิดขึ้น และทางเลือกอื่นเป็นที่เข้าใจแล้ว',
      'ข้าพเจ้ายินยอมให้สัตวแพทย์และเจ้าหน้าที่ของสถานพยาบาลดำเนินการตรวจ รักษา ให้ยา เก็บตัวอย่างส่งตรวจ และทำหัตถการตามที่เห็นสมควรทางวิชาชีพ และรับทราบว่าผลการรักษาอาจไม่เป็นไปตามที่คาดหมายได้ แม้ได้ดำเนินการตามมาตรฐานวิชาชีพแล้ว',
      'ข้าพเจ้ายินยอมรับผิดชอบค่าใช้จ่ายที่เกิดขึ้นจากการรักษาครั้งนี้ จึงลงลายมือชื่อไว้เป็นหลักฐาน',
    ],
    signatures: ['ลงชื่อเจ้าของ / ผู้มีอำนาจตัดสินใจ', 'ลงชื่อสัตวแพทย์', 'ลงชื่อพยาน', 'วันที่'],
  },
  {
    type: 'consent_hospitalize',
    short: 'ใบยินยอมฝากรักษา (นอน รพ.)',
    title: 'หนังสือแสดงความยินยอมให้รับสัตว์ไว้รักษาในสถานพยาบาล',
    subtitle: 'Consent for Hospitalization',
    summaryKeys: ['plan', 'expect_days'],
    sections: [
      petOwnerSection(),
      {
        heading: 'การฝากรักษา',
        fields: [
          { key: 'diagnosis', label: 'การวินิจฉัย / อาการ', type: 'textarea', rows: 2, span: 6, prefill: diagnosisText },
          { key: 'plan', label: 'แผนการรักษาระหว่างพักรักษา', type: 'textarea', rows: 3, span: 6 },
          { key: 'admit_date', label: 'รับไว้วันที่', span: 2, prefill: () => todayTh() },
          { key: 'expect_days', label: 'คาดว่าพักรักษาประมาณ', span: 2, suffix: 'วัน' },
          estimateField,
          { key: 'emergency_contact', label: 'ผู้ติดต่อกรณีฉุกเฉิน + เบอร์', span: 3, prefill: (c) => [c.owner?.name, c.owner?.phone].filter(Boolean).join(' · ') },
          { key: 'emergency', label: 'กรณีหัวใจหยุดเต้น / วิกฤต', span: 3, placeholder: 'ยินยอมให้ช่วยชีวิต (CPR) / ไม่ประสงค์' },
          { key: 'belongings', label: 'ของที่ฝากมาด้วย', span: 3 },
          { key: 'visiting', label: 'เวลาเยี่ยม / ข้อตกลงการติดต่อ', span: 3 },
        ],
      },
    ],
    body: [
      'ข้าพเจ้ายินยอมให้สถานพยาบาลรับสัตว์ของข้าพเจ้าไว้รักษา และยินยอมให้สัตวแพทย์ให้การรักษา ให้ยา ให้สารน้ำ เก็บตัวอย่างส่งตรวจ และทำหัตถการที่จำเป็นระหว่างพักรักษาตามที่เห็นสมควรทางวิชาชีพ',
      'ข้าพเจ้ารับทราบว่าอาการของสัตว์อาจเปลี่ยนแปลงได้ตลอดเวลา และในกรณีที่ติดต่อข้าพเจ้าไม่ได้ ยินยอมให้สัตวแพทย์ตัดสินใจดำเนินการที่จำเป็นเพื่อประโยชน์สูงสุดของสัตว์ รวมถึงการช่วยชีวิตตามความประสงค์ที่ระบุไว้ข้างต้น',
      'ข้าพเจ้ายินยอมรับผิดชอบค่าใช้จ่ายที่เกิดขึ้นจริงตลอดการพักรักษา ซึ่งอาจมากกว่าค่าใช้จ่ายโดยประมาณที่แจ้งไว้หากอาการเปลี่ยนแปลง จึงลงลายมือชื่อไว้เป็นหลักฐาน',
    ],
    signatures: ['ลงชื่อเจ้าของ / ผู้มีอำนาจตัดสินใจ', 'ลงชื่อสัตวแพทย์ผู้รับไว้รักษา', 'ลงชื่อพยาน', 'วันที่'],
  },
  {
    type: 'consent_euthanasia',
    short: 'ใบยินยอมการุณยฆาต',
    title: 'หนังสือแสดงความยินยอมให้ทำการุณยฆาต',
    subtitle: 'Consent for Euthanasia',
    summaryKeys: ['reason', 'body_handling'],
    sections: [
      petOwnerSection(),
      {
        heading: 'รายละเอียด',
        fields: [
          { key: 'owner_id', label: 'เลขบัตรประชาชนเจ้าของ', span: 3 },
          { key: 'diagnosis', label: 'โรค / อาการ', type: 'textarea', rows: 2, span: 6, prefill: diagnosisText },
          { key: 'reason', label: 'เหตุผล / ความเห็นของสัตวแพทย์', type: 'textarea', rows: 3, span: 6 },
          { key: 'method', label: 'วิธีดำเนินการ / ยาที่ใช้', span: 3 },
          { key: 'present', label: 'ผู้อยู่ร่วมขณะดำเนินการ', span: 3 },
          { key: 'body_handling', label: 'การจัดการร่าง', span: 3, placeholder: 'รับกลับ / ฝากฌาปนกิจ' },
          estimateField,
        ],
      },
    ],
    body: [
      'ข้าพเจ้าขอรับรองว่าเป็นเจ้าของสัตว์ตามรายละเอียดข้างต้น หรือเป็นผู้มีอำนาจตัดสินใจแทนเจ้าของโดยชอบ',
      'ข้าพเจ้าได้รับคำอธิบายจากสัตวแพทย์เกี่ยวกับสภาพของสัตว์ แนวทางการรักษาที่เป็นไปได้ และทางเลือกอื่นนอกเหนือจากการทำการุณยฆาตเป็นที่เข้าใจแล้ว และรับทราบว่าการดำเนินการนี้ทำให้สัตว์เสียชีวิตและไม่สามารถย้อนกลับได้',
      'ข้าพเจ้าขอร้องและยินยอมด้วยความสมัครใจให้สัตวแพทย์ทำการุณยฆาตสัตว์ของข้าพเจ้าตามวิธีที่เหมาะสมทางวิชาชีพ และจะไม่เรียกร้องความรับผิดใด ๆ จากสถานพยาบาลและสัตวแพทย์ผู้ดำเนินการ จึงลงลายมือชื่อไว้เป็นหลักฐาน',
    ],
    signatures: ['ลงชื่อเจ้าของ / ผู้มีอำนาจตัดสินใจ', 'ลงชื่อสัตวแพทย์ผู้ดำเนินการ', 'ลงชื่อพยานคนที่ 1', 'ลงชื่อพยานคนที่ 2'],
  },
  {
    type: 'treatment_summary',
    short: 'ใบสรุปการรักษา',
    title: 'ใบสรุปการรักษา',
    subtitle: 'Treatment Summary',
    summaryKeys: ['diagnosis', 'treatment'],
    sections: [
      petOwnerSection(),
      {
        heading: 'สัญญาณชีพ',
        fields: [
          { key: 'temperature', label: 'อุณหภูมิ', span: 2, suffix: '°C', prefill: (c) => (c.visit?.temperature != null ? String(c.visit.temperature) : '') },
          { key: 'heart_rate', label: 'ชีพจร', span: 2, suffix: 'ครั้ง/นาที', prefill: (c) => (c.visit?.heart_rate != null ? String(c.visit.heart_rate) : '') },
          { key: 'resp_rate', label: 'อัตราหายใจ', span: 2, suffix: 'ครั้ง/นาที', prefill: (c) => (c.visit?.resp_rate != null ? String(c.visit.resp_rate) : '') },
        ],
      },
      {
        heading: 'การตรวจรักษา',
        fields: [
          { key: 'symptoms', label: 'อาการที่พามา', type: 'textarea', rows: 2, span: 6, prefill: (c) => c.visit?.symptoms ?? '' },
          { key: 'physical_exam', label: 'ผลตรวจร่างกาย', type: 'textarea', rows: 2, span: 6, prefill: (c) => c.visit?.physical_exam ?? '' },
          { key: 'diagnosis', label: 'การวินิจฉัย', type: 'textarea', rows: 2, span: 6, prefill: diagnosisText },
          { key: 'treatment', label: 'การรักษา / หัตถการ', type: 'textarea', rows: 3, span: 6, prefill: (c) => c.visit?.treatment ?? '' },
          { key: 'meds', label: 'ยาที่จ่าย / วิธีใช้', type: 'textarea', rows: 4, span: 6, prefill: (c) => c.meds.join('\n') },
          { key: 'advice', label: 'คำแนะนำการดูแลต่อ', type: 'textarea', rows: 3, span: 6, prefill: (c) => c.visit?.client_education ?? '' },
          { key: 'follow_up', label: 'นัดครั้งถัดไป', span: 3, prefill: (c) => (c.visit?.follow_up_date ? dateTh(c.visit.follow_up_date) : '') },
        ],
      },
    ],
    signatures: ['ลงชื่อสัตวแพทย์'],
  },
  {
    type: 'health_cert',
    short: 'ใบรับรองสุขภาพสัตว์',
    title: 'ใบรับรองสุขภาพสัตว์',
    subtitle: 'Animal Health Certificate',
    summaryKeys: ['purpose', 'findings'],
    sections: [
      petOwnerSection(),
      {
        heading: 'การรับรอง',
        fields: [
          { key: 'purpose', label: 'วัตถุประสงค์', span: 3, placeholder: 'เดินทาง / ซื้อขาย / ประกวด / อื่น ๆ' },
          { key: 'microchip', label: 'ไมโครชิป', span: 3, prefill: (c) => c.pet.microchip ?? '' },
          { key: 'findings', label: 'ผลการตรวจร่างกาย', type: 'textarea', rows: 3, span: 6, prefill: () => 'ตรวจร่างกายแล้ว สุขภาพแข็งแรง ไม่พบความผิดปกติ และไม่พบอาการของโรคติดต่อในวันที่ตรวจ' },
          { key: 'vaccines', label: 'ประวัติวัคซีน', type: 'textarea', rows: 4, span: 6, prefill: vaccineText },
          { key: 'parasite', label: 'การถ่ายพยาธิ / ป้องกันปรสิต', span: 3 },
          { key: 'valid_until', label: 'ใบรับรองมีผลถึง', span: 3 },
          { key: 'vet_license', label: 'เลขที่ใบอนุญาตสัตวแพทย์', span: 3 },
        ],
      },
    ],
    body: [
      'ข้าพเจ้าสัตวแพทย์ผู้มีนามข้างท้ายนี้ ขอรับรองว่าได้ทำการตรวจสัตว์ตามรายละเอียดข้างต้นในวันที่ระบุไว้ และผลการตรวจเป็นไปตามที่บันทึกไว้ในเอกสารฉบับนี้',
      'ใบรับรองนี้ออกให้ตามผลการตรวจในวันดังกล่าวเท่านั้น ไม่ครอบคลุมภาวะที่เกิดขึ้นภายหลังวันที่ตรวจ',
    ],
    signatures: ['ลงชื่อสัตวแพทย์ผู้ตรวจ'],
  },
]

export function docDef(type: string): DocTypeDef | undefined {
  return DOC_TYPES.find((d) => d.type === type)
}

export function docFields(def: DocTypeDef): DocField[] {
  return def.sections.flatMap((s) => s.fields)
}

/** ค่าตั้งต้นของทุกช่องตอนเปิดฟอร์มใหม่ */
export function buildPrefill(def: DocTypeDef, ctx: DocContext): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of docFields(def)) out[f.key] = f.prefill?.(ctx) ?? ''
  return out
}

/** บรรทัดสรุปในลิสต์ประวัติ — ตัดสั้นไม่ให้ดันหน้า */
export function docSummary(def: DocTypeDef, data: Record<string, string>): string {
  const text = def.summaryKeys
    .map((k) => (data[k] ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' — ')
  return text.length > 160 ? text.slice(0, 157) + '…' : text
}

/** หมดเวลาแก้ไขเมื่อไหร่ (created_at + 24 ชม.) */
export function docEditDeadline(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + DOC_EDIT_HOURS * 3600_000)
}

/** ยังแก้ได้ไหม — DB บังคับด้วย trigger อีกชั้น ตรงนี้ไว้ซ่อนปุ่ม/ขึ้นข้อความ */
export function isDocEditable(createdAt: string): boolean {
  return Date.now() < docEditDeadline(createdAt).getTime()
}

/** เหลือเวลาแก้อีกเท่าไหร่ แบบอ่านง่าย — หมดแล้วคืน null */
export function docEditLeft(createdAt: string): string | null {
  const ms = docEditDeadline(createdAt).getTime() - Date.now()
  if (ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  return h > 0 ? `${h} ชม. ${mins % 60} นาที` : `${mins} นาที`
}
