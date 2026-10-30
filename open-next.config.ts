import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache'

/**
 * POS เป็นหน้าหลังล็อกอินเกือบทั้งหมด จึงแทบไม่มีหน้า ISR ให้เก็บ
 * แต่ /api/favicon ตั้ง revalidate ไว้ 1 ชม. และทุกแท็บของทุกเครื่องในร้านจะขอไฟล์นี้
 * ถ้าไม่มีที่เก็บ ทุกคำขอจะวิ่งไปดึงโลโก้จาก Supabase storage ใหม่ทุกครั้ง
 *
 * withRegionalCache ซ้อน Cache API ของ Worker ไว้หน้า R2 — ที่เคยขอในดาต้าเซ็นเตอร์นั้นแล้ว
 * จะถูกใช้ซ้ำได้โดยไม่ต้องแตะ R2 อีก
 */
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: 'long-lived',
  }),
})
