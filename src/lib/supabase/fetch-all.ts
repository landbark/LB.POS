/**
 * PostgREST (Supabase) คืนแถวได้สูงสุด 1000 แถวต่อคำขอเสมอ — ตั้ง `.limit(5000)` ก็ยังได้แค่ 1000
 * และไม่มี error แจ้ง ทำให้ยอดรวมที่คำนวณจากผลลัพธ์นั้นต่ำกว่าความจริงแบบเงียบ ๆ
 *
 * ตัวช่วยนี้ไล่ดึงทีละหน้าจนหมด
 *
 *   const items = await fetchAll((from, to) =>
 *     supabase.from('transaction_items').select('subtotal').order('id').range(from, to)
 *   )
 *
 * ต้องใส่ `.order()` ด้วยคอลัมน์ที่ไม่ซ้ำ (เช่น id) เสมอ — ไม่งั้นลำดับระหว่างหน้าไม่คงที่
 * บางแถวจะถูกดึงซ้ำและบางแถวหายไป
 */

/** ลิมิตฝั่งเซิร์ฟเวอร์ ขอมากกว่านี้ก็ได้เท่านี้ */
const PAGE_SIZE = 1000

interface Page<T> {
  data: T[] | null
  error: { message: string } | null
}

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    // โยน error ออกไปเลย ดีกว่าคืนข้อมูลไม่ครบแล้วให้เอาไปคิดยอดต่อ
    if (error) throw new Error(error.message)

    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
}
