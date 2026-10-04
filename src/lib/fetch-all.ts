const PAGE = 1000

/**
 * Supabase ตัดผลลัพธ์ที่ 1000 แถวเสมอ ถึงจะไม่ได้ใส่ .limit() ก็ตาม
 * ตารางสินค้าโตเกินนั้นไปแล้ว (2,100+ รายการ) — ถ้าไม่ไล่ดึงทีละหน้า
 * สินค้าที่เรียงตามชื่อแล้วอยู่หลังลำดับ 1000 จะหายไปเงียบๆ ยิงบาร์โค้ดก็ไม่เจอ
 *
 * builder ของ supabase-js ใช้ซ้ำไม่ได้ เลยรับเป็นฟังก์ชันที่สร้าง query ใหม่ทุกหน้า
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}
