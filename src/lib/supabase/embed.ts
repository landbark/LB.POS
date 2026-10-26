/**
 * โปรเจกต์นี้ไม่ได้ generate type ของตารางจาก Supabase มันเลยเดา type ของ embed
 * แบบ to-one (เช่น product_lots → products) เป็น array ทั้งที่ PostgREST คืน object ตัวเดียว
 *
 * ตัวนี้รับได้ทั้งสองแบบ — ไม่ต้อง cast เป็น any แล้วลุ้นเอาว่าของจริงหน้าตายังไง
 * และถ้าวันหนึ่ง Supabase คืนเป็น array จริงก็ยังอ่านออก ไม่ขึ้นค่าว่าง
 */
export function toOne<T>(embed: T | T[] | null | undefined): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null
  return embed ?? null
}
