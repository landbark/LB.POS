import type { Diagnosis } from './types'

/**
 * รูปร่างน้อยสุดที่ใช้โชว์ชื่อโรค — รับทั้ง object และ array
 * (PostgREST คืน relation many-to-one เป็น object แต่ type ที่ infer มาเป็น array เหมือน relation อื่นในโปรเจกต์)
 */
export type DiagnosisLink = { diagnoses?: Diagnosis | Diagnosis[] | null }

/** ชื่อโรคที่ติดกับ visit เรียงตามลำดับที่หมอเลือก */
export function diagnosisNames(visitDiagnoses: DiagnosisLink[] | null | undefined): string[] {
  return (visitDiagnoses ?? [])
    .flatMap((vd) => (Array.isArray(vd.diagnoses) ? vd.diagnoses : [vd.diagnoses]))
    .map((d) => d?.name)
    .filter((n): n is string => !!n)
}

/** ข้อความวินิจฉัยสำหรับโชว์/พิมพ์ — ชื่อโรคจากแคตตาล็อก แล้วต่อด้วยรายละเอียดที่หมอพิมพ์เอง */
export function visitDiagnosisText(
  visit: { diagnosis: string | null; visit_diagnoses?: DiagnosisLink[] | null },
): string {
  const names = diagnosisNames(visit.visit_diagnoses).join(', ')
  const note = (visit.diagnosis ?? '').trim()
  if (names && note) return `${names} — ${note}`
  return names || note
}

/** ข้อความมีตัวอักษรไทยไหม — ใช้เดาว่าที่พิมพ์มาควรลงช่องไทยหรืออังกฤษ ตอนเพิ่มโรคใหม่เร็วๆ ในห้องตรวจ */
export const hasThai = (s: string) => /[฀-๿]/.test(s)

/** ค้นหาชื่อโรค — ตัดช่องว่าง ไม่สนตัวพิมพ์ใหญ่เล็ก ค้นได้ทั้งชื่อรวม/อังกฤษ/ไทย */
export function searchDiagnoses(list: Diagnosis[], query: string, limit = 12): Diagnosis[] {
  const q = query.trim().toLowerCase()
  if (!q) return list.slice(0, limit)
  return list
    .filter((d) =>
      d.name.toLowerCase().includes(q)
      || (d.name_en ?? '').toLowerCase().includes(q)
      || (d.name_th ?? '').toLowerCase().includes(q)
    )
    .slice(0, limit)
}

/** มีชื่อนี้อยู่แล้วไหม (ไม่สนตัวพิมพ์ใหญ่เล็ก — unique index เป็น lower(name)) */
export const findByName = (list: Diagnosis[], name: string) =>
  list.find((d) => d.name.toLowerCase() === name.trim().toLowerCase()) ?? null
